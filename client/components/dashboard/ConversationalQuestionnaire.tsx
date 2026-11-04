"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Check, ChevronRight, Loader2, PanelRight, Send } from "lucide-react";
import type { LearningQuestion } from "@/lib/api/lms";
import { getUser } from "@/lib/auth";
import { btn, inputClass } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useJourneyRail } from "@/components/learning-ui/useJourneyRail";
import {
  HeaderIconButton,
  JourneyBody,
  JourneyCanvas,
  JourneyHeader,
  LearnerLine,
  SANA_AVATAR,
  SanaLine,
  leadIndent,
} from "@/components/journeys/JourneyKit";
import { AfterAnswersNote, DiscoveryHowItWorks } from "@/components/journeys/DiscoveryPanel";
import "@/components/learning-ui/sana-studio.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type Answers = Record<string, string | string[] | number>;

type BubbleKind = "assistant" | "user" | "building" | "error";

interface Bubble {
  id: string;
  kind: BubbleKind;
  text: string;
  questionIdx?: number;
}

interface ConversationalQuestionnaireProps {
  questions: LearningQuestion[];
  onGenerate: (answers: Record<string, unknown>) => Promise<void>;
}

const HOW_IT_WORKS = [
  { label: "Your goals", detail: "A few quick questions about what you want from learning." },
  { label: "Skill check", detail: "Your experience and how you like to learn." },
  { label: "Path ready", detail: "Anna orders AI Amplify courses into a path made for you." },
];

// ── Answer controls ───────────────────────────────────────────────────────────

const OPTION_CLASS =
  "flex min-h-[44px] w-full items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-start text-sm leading-snug text-ui-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand";

function ControlCard({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn("mb-4 flex flex-col gap-2 rounded-[14px] border border-ui-line bg-ui-surface p-3 shadow-ui sm:p-4", leadIndent)}>
      {children}
    </div>
  );
}

function SingleControl({
  question,
  onAnswer,
}: {
  question: LearningQuestion;
  onAnswer: (value: string) => void;
}) {
  return (
    <ControlCard>
      <div role="group" aria-label={question.prompt} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(question.options ?? []).slice(0, 6).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onAnswer(opt)}
            className={cn(OPTION_CLASS, "border-ui-line bg-ui-surface hover:bg-ui-surface-2")}
          >
            {opt}
          </button>
        ))}
      </div>
    </ControlCard>
  );
}

function ScaleControl({
  question,
  onAnswer,
}: {
  question: LearningQuestion;
  onAnswer: (value: number) => void;
}) {
  return (
    <ControlCard>
      <div role="group" aria-label={question.prompt} className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onAnswer(n)}
            className={cn(OPTION_CLASS, "flex-1 justify-center border-ui-line bg-ui-surface font-semibold hover:bg-ui-surface-2")}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between px-1 text-xs text-ui-muted" aria-hidden>
        <span>Not at all</span>
        <span>Very much</span>
      </div>
    </ControlCard>
  );
}

function MultiControl({
  question,
  onAnswer,
}: {
  question: LearningQuestion;
  onAnswer: (value: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(opt: string) {
    setSelected((prev) => (prev.includes(opt) ? prev.filter((v) => v !== opt) : [...prev, opt]));
  }

  return (
    <ControlCard>
      <div role="group" aria-label={question.prompt} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(question.options ?? []).slice(0, 6).map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(opt)}
              className={cn(
                OPTION_CLASS,
                active ? "border-ui-brand bg-ui-brand-soft font-semibold" : "border-ui-line bg-ui-surface hover:bg-ui-surface-2",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px]",
                  active ? "border-ui-brand bg-ui-brand text-white" : "border-ui-line",
                )}
              >
                {active && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              {opt}
            </button>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => onAnswer(selected)}
          className={cn(btn({ variant: "primary", size: "md" }), "h-9")}
        >
          Continue{selected.length > 0 ? ` (${selected.length})` : ""}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </ControlCard>
  );
}

function TextControl({ onAnswer }: { onAnswer: (value: string) => void }) {
  const [value, setValue] = useState("");

  function send() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAnswer(trimmed);
  }

  return (
    <ControlCard>
      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          aria-label="Your answer"
          placeholder="Type your answer"
          className={cn(inputClass, "h-auto flex-1 resize-none py-2.5")}
        />
        <button
          type="button"
          disabled={!value.trim()}
          onClick={send}
          aria-label="Send"
          className={btn({ variant: "primary", size: "icon" })}
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </ControlCard>
  );
}

// ── AnswerControl router ──────────────────────────────────────────────────────

function AnswerControl({
  question,
  onAnswer,
}: {
  question: LearningQuestion;
  onAnswer: (value: string | string[] | number) => void;
}) {
  if (question.type === "single") {
    return <SingleControl question={question} onAnswer={onAnswer} />;
  }
  if (question.type === "scale") {
    return <ScaleControl question={question} onAnswer={onAnswer} />;
  }
  if (question.type === "multi") {
    return <MultiControl question={question} onAnswer={onAnswer} />;
  }
  return <TextControl onAnswer={onAnswer} />;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ConversationalQuestionnaire({
  questions,
  onGenerate,
}: ConversationalQuestionnaireProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [answers, setAnswers] = useState<Answers>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [panelOpen, togglePanel] = useJourneyRail();

  const addBubble = useCallback((bubble: Bubble) => {
    setBubbles((prev) => [...prev, bubble]);
  }, []);

  // Auto-scroll on new bubble
  useEffect(() => {
    if (bubbles.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [bubbles]);

  // Called when a question is answered (Q1 onward, or Q0 via overlay)
  const handleAnswer = useCallback(
    async (questionIdx: number, value: string | string[] | number) => {
      const q = questions[questionIdx];
      const displayText = Array.isArray(value) ? value.join(", ") : String(value);

      const nextAnswers = { ...answers, [q.id]: value };
      setAnswers(nextAnswers);
      addBubble({ id: `user-${questionIdx}`, kind: "user", text: displayText });

      const nextIdx = questionIdx + 1;

      if (nextIdx < questions.length) {
        addBubble({
          id: `q-${nextIdx}`,
          kind: "assistant",
          text: questions[nextIdx].prompt,
          questionIdx: nextIdx,
        });
        setCurrentIdx(nextIdx);
      } else {
        setDone(true);
        setError(null);
        addBubble({
          id: "building",
          kind: "building",
          text: "Building your personalised learning path.",
        });
        try {
          await onGenerate(nextAnswers as Record<string, unknown>);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Something went wrong. Please try again.";
          setError(msg);
          setDone(false);
          addBubble({ id: `error-${Date.now()}`, kind: "error", text: msg });
        }
      }
    },
    [questions, answers, addBubble, onGenerate],
  );

  // Overlay answer: dismiss overlay then feed into the normal chat flow from Q1
  const handleOverlayAnswer = useCallback(
    (value: string | string[] | number) => {
      setShowOverlay(false);
      handleAnswer(0, value);
    },
    [handleAnswer],
  );

  // Retry after error — re-ask the last question
  const handleRetry = useCallback(() => {
    const lastIdx = questions.length - 1;
    setError(null);
    setDone(false);
    setBubbles((prev) => prev.filter((b) => b.kind !== "error" && b.kind !== "building"));
    addBubble({
      id: `q-retry-${Date.now()}`,
      kind: "assistant",
      text: questions[lastIdx].prompt,
      questionIdx: lastIdx,
    });
    setCurrentIdx(lastIdx);
    setAnswers((prev) => {
      const copy = { ...prev };
      delete copy[questions[lastIdx].id];
      return copy;
    });
  }, [questions, addBubble]);

  const totalQ = questions.length;
  const firstName = (getUser()?.fullName ?? "").trim().split(/\s+/)[0];
  const shownIdx = showOverlay ? 0 : currentIdx;

  return (
    <JourneyCanvas>
      <JourneyHeader
        leading={<img src={SANA_AVATAR} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover object-top" />}
        title="Learning Path"
        subtitle="Anna builds your path of AI Amplify courses from a few questions"
        progress={
          totalQ > 0 && !done
            ? { done: Math.max(0, shownIdx), total: totalQ, label: `Question ${Math.min(shownIdx + 1, totalQ)} of ${totalQ}` }
            : undefined
        }
        secondaryActions={
          <HeaderIconButton
            label={panelOpen ? "Hide how it works" : "Show how it works"}
            aria-pressed={panelOpen}
            onClick={togglePanel}
            className="hidden xl:inline-flex"
          >
            <PanelRight className="h-4 w-4" aria-hidden />
          </HeaderIconButton>
        }
      />

      <JourneyBody
        panelOpen={panelOpen}
        panel={
          <>
            <DiscoveryHowItWorks steps={HOW_IT_WORKS} />
            <AfterAnswersNote />
          </>
        }
      >
        <div className="h-full overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[840px] flex-col gap-4 px-4 py-5 sm:px-8 sm:py-7">
            <SanaLine>
              {firstName ? `Hi ${firstName}, I'm Anna. ` : "Hi, I'm Anna. "}I&apos;ll ask you {totalQ} quick question
              {totalQ !== 1 ? "s" : ""} to build a learning path of AI Amplify courses made for you.
            </SanaLine>

            {/* Opening turn: the first question, answered in place. */}
            {questions.length > 0 && (
              <div>
                <SanaLine>{questions[0].prompt}</SanaLine>
                {showOverlay && (
                  <div className="mt-3">
                    <AnswerControl question={questions[0]} onAnswer={handleOverlayAnswer} />
                  </div>
                )}
              </div>
            )}

            {bubbles.map((bubble) => {
              if (bubble.kind === "user") {
                return <LearnerLine key={bubble.id}>{bubble.text}</LearnerLine>;
              }
              if (bubble.kind === "building") {
                return (
                  <SanaLine key={bubble.id}>
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-ui-brand-text" aria-hidden />
                      {bubble.text}
                    </span>
                  </SanaLine>
                );
              }
              if (bubble.kind === "error") {
                return (
                  <div
                    key={bubble.id}
                    role="alert"
                    className={cn("flex flex-wrap items-center gap-3 rounded-[10px] border border-ui-line bg-ui-surface px-4 py-3 text-sm text-ui-text", leadIndent)}
                  >
                    <span className="flex-1">{bubble.text}</span>
                    <button type="button" onClick={handleRetry} className={btn({ variant: "primary", size: "sm" })}>
                      Retry
                    </button>
                  </div>
                );
              }
              const isActive =
                bubble.kind === "assistant" &&
                bubble.questionIdx === currentIdx &&
                !done &&
                error === null;
              return (
                <div key={bubble.id}>
                  <SanaLine>{bubble.text}</SanaLine>
                  {isActive && bubble.questionIdx !== undefined && (
                    <div className="mt-3">
                      <AnswerControl
                        question={questions[bubble.questionIdx]}
                        onAnswer={(v) => handleAnswer(bubble.questionIdx!, v)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>
      </JourneyBody>
    </JourneyCanvas>
  );
}
