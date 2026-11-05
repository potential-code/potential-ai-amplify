/**
 * AI analytics (AI Insights + AI Dashboard) — service layer.
 *
 * The ONE query path: a single guard, a single executor and a single
 * semaphore, so a second AI surface cannot grow its own set of limits to get
 * wrong. Ported from Sama's ai-insights.service.ts without its result cache —
 * AI Amplify's `ai` views are live, so a cached answer could be stale.
 */

import { AppError } from "../utils/app-error";
import { executeAiSql, type SqlExecuteResult } from "./ai-sql/execute";
import { buildSqlCatalog, catalogViewNames, isAiSchemaInstalled, type SqlCatalog } from "./ai-sql/schema-catalog";

// A burst of chat or dashboard traffic queues rather than starving the pool.
// Beyond the queue depth a request is shed: an answer that will not come for a
// minute is worse than one that says "try again".
const EXECUTE_CONCURRENCY = 4;
const MAX_QUEUE_DEPTH = 25;

let activeSlots = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeSlots < EXECUTE_CONCURRENCY) {
    activeSlots += 1;
    return Promise.resolve();
  }
  if (queue.length >= MAX_QUEUE_DEPTH) {
    return Promise.reject(new AppError("The analytics service is busy. Try again in a moment.", 503, "AI_ANALYTICS_BUSY"));
  }
  return new Promise<void>((resolve) => {
    queue.push(() => {
      activeSlots += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeSlots -= 1;
  queue.shift()?.();
}

/** Also used by the ecosystem statistics (eco.service.ts): one semaphore for all agent SQL. */
export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireSlot();
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

/**
 * 503 rather than every query failing on `relation "ai.learner" does not
 * exist` — the schema is applied at boot, so this only shows if that failed.
 */
async function assertAiSchemaInstalled(): Promise<void> {
  if (!(await isAiSchemaInstalled())) {
    throw new AppError(
      "The AI analytics reporting schema has not been installed on this database yet.",
      503,
      "AI_ANALYTICS_NOT_INSTALLED",
    );
  }
}

/** The sql-1.x catalogue both potential-ai graphs plan against. */
export async function getCatalog(): Promise<SqlCatalog> {
  await assertAiSchemaInstalled();
  return buildSqlCatalog();
}

/** Guards and runs one generated SELECT against the `ai` schema. */
export async function runQuery(rawSql: string): Promise<SqlExecuteResult> {
  await assertAiSchemaInstalled();
  return withSlot(() => executeAiSql(rawSql, catalogViewNames()));
}
