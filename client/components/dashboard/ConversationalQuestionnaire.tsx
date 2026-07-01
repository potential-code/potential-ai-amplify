"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SendHorizontal, Target, GraduationCap, TrendingUp } from "lucide-react";
import type { LearningQuestion } from "@/lib/api/lms";
import { getUser } from "@/lib/auth";

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

// ── Overlay constants ─────────────────────────────────────────────────────────

const STEPS = [
  { num: "1", label: "Your goals" },
  { num: "2", label: "Skill check" },
  { num: "3", label: "Path ready" },
];

const VALUE_PROPS = [
  { Icon: Target, label: "Custom milestones" },
  { Icon: GraduationCap, label: "Matched to your level" },
  { Icon: TrendingUp, label: "Track progress" },
];

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── Assistant bubble ──────────────────────────────────────────────────────────

function AssistantBubble({ text, isBuilding }: { text: string; isBuilding?: boolean }) {
  return (
    <motion.div
      className="flex gap-2 items-end mb-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <img
        src="/images/redesign/smeep-avatar-96.png"
        alt="Sana"
        className="w-7 h-7 rounded-full object-cover object-top flex-shrink-0"
      />
      <div
        className="px-3 py-2 text-[13px] text-[#1A0A12] leading-relaxed bg-white border border-[#f7e8f0] flex items-center gap-2"
        style={{ borderRadius: "14px 14px 14px 0", maxWidth: "85%" }}
      >
        {isBuilding && <Spinner />}
        <span>{text}</span>
      </div>
    </motion.div>
  );
}

// ── User bubble ───────────────────────────────────────────────────────────────

function UserBubble({ text }: { text: string }) {
  const user = getUser();
  const initial = (user?.fullName ?? user?.email ?? "U")[0].toUpperCase();
  return (
    <motion.div
      className="flex gap-2 items-end flex-row-reverse mb-3"
      initial={{ opacity: 0, y: 10, x: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold select-none"
        style={{ background: "linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)" }}
      >
        {initial}
      </div>
      <div
        className="px-3 py-2 text-[13px] text-white leading-relaxed whitespace-pre-wrap"
        style={{
          background: "linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)",
          borderRadius: "14px 14px 0 14px",
          maxWidth: "78%",
        }}
      >
        {text}
      </div>
    </motion.div>
  );
}

// ── Answer controls ───────────────────────────────────────────────────────────

const GRAD = "linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)";
const OPTION_BORDER = "#9f2063";

function SingleControl({
  question,
  onAnswer,
}: {
  question: LearningQuestion;
  onAnswer: (value: string) => void;
}) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-2 mb-4 ml-9"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
    >
      {(question.options ?? []).slice(0, 6).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onAnswer(opt)}
          className="cursor-pointer text-left rounded-xl border-2 bg-white px-4 py-2.5 text-[13px] text-brand-text-primary hover:bg-brand-surface transition-colors"
          style={{ borderColor: OPTION_BORDER }}
        >
          {opt}
        </button>
      ))}
    </motion.div>
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
    <motion.div
      className="flex gap-2 mb-4 ml-9"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onAnswer(n)}
          className="cursor-pointer flex-1 py-2 rounded-xl border-2 bg-white text-sm font-semibold text-brand-text-secondary hover:bg-brand-surface transition-colors"
          style={{ borderColor: OPTION_BORDER }}
        >
          {n}
        </button>
      ))}
    </motion.div>
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
    <motion.div
      className="flex flex-col gap-2 mb-4 ml-9"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
    >
      <div className="grid grid-cols-2 gap-2">
        {(question.options ?? []).slice(0, 6).map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className="cursor-pointer text-left rounded-xl border-2 px-4 py-2.5 text-[13px] transition-colors"
              style={
                active
                  ? { background: GRAD, color: "#fff", borderColor: "transparent" }
                  : { background: "#fff", color: "#1A0A12", borderColor: OPTION_BORDER }
              }
            >
              {opt}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={selected.length === 0}
        onClick={() => onAnswer(selected)}
        className="mt-1 self-start cursor-pointer rounded-xl px-5 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: GRAD }}
      >
        Continue
      </button>
    </motion.div>
  );
}

function TextControl({ onAnswer }: { onAnswer: (value: string) => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function send() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAnswer(trimmed);
  }

  return (
    <motion.div
      className="flex items-end gap-2 mb-4 ml-9"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
    >
      <textarea
        ref={ref}
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Type your answer…"
        className="flex-1 rounded-xl border border-brand-surface-2 bg-white px-3 py-2.5 text-[13px] text-brand-text-primary placeholder:text-brand-text-muted focus:outline-none focus:border-brand-primary transition-colors resize-none"
      />
      <button
        type="button"
        disabled={!value.trim()}
        onClick={send}
        aria-label="Send"
        className="h-8 w-8 cursor-pointer rounded-full flex items-center justify-center flex-shrink-0 self-end transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ background: GRAD }}
      >
        <SendHorizontal size={13} strokeWidth={2.5} className="text-white" />
      </button>
    </motion.div>
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

  const addBubble = useCallback((bubble: Bubble) => {
    setBubbles((prev) => [...prev, bubble]);
  }, []);

  // Auto-scroll on new bubble
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
          text: "Building your personalised learning path…",
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

  return (
    <div
      className="flex flex-col h-[calc(100vh-7rem)] min-h-[560px] rounded-2xl border border-brand-surface-2 overflow-hidden"
      style={{ background: "#ffffff", boxShadow: "0 16px 64px rgba(26, 10, 18, 0.24), 0 4px 20px rgba(26, 10, 18, 0.14)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
        style={{ background: "linear-gradient(120deg, #1A0A12 0%, #2d0f20 100%)" }}
      >
        <img
          src="/images/redesign/smeep-avatar-96.png"
          alt="Sana"
          className="w-7 h-7 rounded-full object-cover object-top"
        />
        <div>
          <p className="text-[13px] font-bold text-white leading-tight">Sana — Learning Path Advisor</p>
          <p className="text-[11px] text-white/50 leading-tight">Building your personalised learning path</p>
        </div>
      </div>

      {/* Progress bar — only visible after overlay is dismissed */}
      {totalQ > 0 && currentIdx >= 0 && !done && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-brand-surface-2 bg-white/70">
          <span className="text-[11px] font-medium text-brand-text-muted select-none">
            Question {Math.min(currentIdx + 1, totalQ)} of {totalQ}
          </span>
          <div className="flex-1 h-1 rounded-full bg-brand-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${((currentIdx + 1) / totalQ) * 100}%`,
                background: GRAD,
              }}
            />
          </div>
        </div>
      )}

      {/* Chat area + overlay wrapper */}
      <div className="relative flex-1 overflow-hidden">
        {/* Scrollable chat */}
        <div className="h-full overflow-y-auto px-4 pt-4 pb-2">
          <AnimatePresence initial={false}>
            {bubbles.map((bubble) => {
              if (bubble.kind === "user") {
                return <UserBubble key={bubble.id} text={bubble.text} />;
              }
              if (bubble.kind === "building") {
                return <AssistantBubble key={bubble.id} text={bubble.text} isBuilding />;
              }
              if (bubble.kind === "error") {
                return (
                  <motion.div
                    key={bubble.id}
                    className="flex gap-2 items-start mb-3 ml-9"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 flex items-center gap-3">
                      <span>{bubble.text}</span>
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="rounded-lg px-3 py-1 text-[12px] font-semibold text-white flex-shrink-0"
                        style={{ background: GRAD }}
                      >
                        Retry
                      </button>
                    </div>
                  </motion.div>
                );
              }
              const isActive =
                bubble.kind === "assistant" &&
                bubble.questionIdx === currentIdx &&
                !done &&
                error === null;
              return (
                <div key={bubble.id}>
                  <AssistantBubble text={bubble.text} />
                  {isActive && bubble.questionIdx !== undefined && (
                    <AnswerControl
                      question={questions[bubble.questionIdx]}
                      onAnswer={(v) => handleAnswer(bubble.questionIdx!, v)}
                    />
                  )}
                </div>
              );
            })}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Intro overlay — shows Q0 in COD-style layout, dismissed on answer */}
        {showOverlay && questions.length > 0 && (
          <div className="absolute inset-0 z-10 flex flex-col bg-white overflow-y-auto">
            <div className="flex-1 flex flex-col items-center justify-center px-5 pt-6 pb-4">
              {/* Sana avatar */}
              <img
                src="/images/redesign/smeep-avatar-96.png"
                alt="Sana"
                className="w-24 h-24 rounded-full object-cover object-top mb-4 flex-shrink-0"
                style={{
                  boxShadow: "0 0 0 4px white, 0 0 0 6px #e8b4d0, 0 0 32px 8px rgba(159,32,99,0.25)",
                }}
              />

              {/* Greeting */}
              <h2 className="text-lg font-black text-[#1A0A12] text-center leading-tight mb-1.5">
                Hi! I&apos;m Sana.
              </h2>
              <p className="text-xs text-[#6b7280] text-center leading-relaxed mb-5 max-w-[280px]">
                I&apos;ll ask you a few quick questions to build a personalised learning path just for you.
              </p>

              {/* Step indicator */}
              <div className="flex items-start mb-5">
                {STEPS.map((step, i) => (
                  <div key={step.num} className="flex items-start">
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: GRAD }}
                      >
                        {step.num}
                      </div>
                      <span className="text-[10px] text-[#6b7280] text-center whitespace-nowrap">
                        {step.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="h-px w-10 mt-3.5 flex-shrink-0" style={{ background: "#e8b4d0" }} />
                    )}
                  </div>
                ))}
              </div>

              {/* Value props */}
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                {VALUE_PROPS.map(({ Icon, label }) => (
                  <div
                    key={label}
                    className="flex flex-row items-center gap-2 px-3 py-2 overflow-hidden relative"
                    style={{
                      borderRadius: "999px",
                      background: "linear-gradient(120deg, rgba(159,32,99,0.10) 0%, rgba(122,26,76,0.28) 100%)",
                      border: "1.5px solid rgba(159,32,99,0.25)",
                      boxShadow: "0 2px 10px rgba(159,32,99,0.07)",
                    }}
                  >
                    <Icon
                      className="absolute -bottom-2 -right-3 opacity-[0.07]"
                      size={44}
                      strokeWidth={1.5}
                      style={{ color: "#9f2063" }}
                    />
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.30)" }}
                    >
                      <Icon size={13} strokeWidth={2} style={{ color: "#9f2063" }} />
                    </div>
                    <span
                      className="text-[11px] font-semibold relative z-10 whitespace-nowrap"
                      style={{ color: "#3d1a2b" }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* First question prompt */}
              <p
                className="text-sm font-semibold text-center mb-1 w-full px-2"
                style={{ color: "rgba(159,32,99,0.85)" }}
              >
                {questions[0].prompt}
              </p>

              {/* Answer control — same components as chat flow, same styling */}
              <div className="w-full">
                <AnswerControl question={questions[0]} onAnswer={handleOverlayAnswer} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
