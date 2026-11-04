"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CopilotKit, useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import { cn } from "@/lib/utils";
import {
  COPILOT_RUNTIME_URL,
  COPILOT_AGENT,
  getCopilotHeaders,
  getLandingPageThreadId,
  clearLandingPageThreadId,
  useCopilotTokenReady,
} from "../dashboard/copilotConfig";
import { homeFor, refreshUser } from "@/lib/auth";
import { authClient } from "@/lib/authClient";
import "../dashboard/copilot.css";
import { apiFetch } from "@/lib/api";
import {
  SmeepAssistantMessage,
  SmeepUserMessage,
  SmeepChatInput,
  SmeepTypingCursor,
} from "../dashboard/chat-components";
import { CountryPickerCard } from "./CountryPickerCard";
import { RegistrationConfirmCard } from "./RegistrationConfirmCard";
import { OtpEntryCard } from "./OtpEntryCard";
import { SIGN_UP_PROMPT as ASSISTANT_INSTRUCTIONS } from "../../../shared/anna/prompts";

// ---------------------------------------------------------------------------
// Landing-specific assistant message wrapper
// V1 CopilotChat passes isLoading/isGenerating to AssistantMessage; V2 doesn't.
// When isLoading=true there is no content yet — show the typing dots instead
// of rendering nothing (which is what SmeepAssistantMessage does for empty msgs).
// ---------------------------------------------------------------------------
// V1 UserMessageProps has message as optional; V2 requires it — bridge with any.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LandingUserMessage(props: any) {
  return <SmeepUserMessage {...props} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LandingAssistantMessage(props: any) {
  const raw = props.message?.content;
  const content =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw
            .map((p: { type?: string; text?: string }) =>
              p?.type === "text" ? (p.text ?? "") : "",
            )
            .join("")
        : "";
  const isEmpty = content.trim().length === 0 && !props.message?.toolCalls?.length;

  if (isEmpty && (props.isLoading || props.isGenerating || props.isCurrentMessage)) {
    return <SmeepTypingCursor />;
  }
  return <SmeepAssistantMessage {...props} />;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistrationData {
  fullName?: string;
  email?: string;
  verifiedToken?: string; // returned by /api/auth/amplify/sign-up/verify-code — never sent to LLM
  country?: string; // ISO code e.g. "NG"
  countryName?: string; // display name e.g. "Nigeria"
  couponCode?: string;
}

interface LoginData {
  email?: string;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------





// ---------------------------------------------------------------------------
// Outer wrapper — owns the CopilotKit provider
// ---------------------------------------------------------------------------

/**
 * Anna's registration / login chat for visitors.
 * `autoStart` skips the welcome panel and sends "I want to register" as soon as
 * the chat is ready (used when a visitor picked "I want to register" elsewhere).
 */
export function LandingRegistrationChat({ autoStart = false }: { autoStart?: boolean } = {}) {
  const [threadId] = useState(() => getLandingPageThreadId());
  // Anonymous visitors get a short-lived GUEST service token (minted by the
  // AI Amplify server) — the AI runtime requires auth on every request. Mount the
  // provider only once the token is cached so its first request carries it.
  const copilotReady = useCopilotTokenReady();

  // Clear the module-level thread ID on unmount so the next visit to the
  // landing page (e.g. after logout) starts a fresh conversation.
  useEffect(() => () => clearLandingPageThreadId(), []);

  if (!copilotReady) {
    // Match the real chat's layout (it fills the hero slot absolutely) so the
    // placeholder occupies the same space while the guest token mints.
    return (
      <div
        role="status"
        aria-label="Starting Anna"
        className="absolute inset-0 animate-pulse rounded-[14px] border border-ui-line bg-ui-surface-2"
      />
    );
  }

  return (
    <CopilotKit
      runtimeUrl={COPILOT_RUNTIME_URL}
      agent={COPILOT_AGENT}
      threadId={threadId}
      headers={getCopilotHeaders()}
      /* enableInspector kills the floating debug diamond + announcement
         bubbles; showDevConsole only suppresses error toasts. */
      enableInspector={false}
      showDevConsole={false}
    >
      <LandingRegistrationChatInner autoStart={autoStart} />
    </CopilotKit>
  );
}

// ---------------------------------------------------------------------------
// Inner component — all state and hooks live here
// ---------------------------------------------------------------------------

function LandingRegistrationChatInner({ autoStart }: { autoStart: boolean }) {
  const router = useRouter();
  const registrationData = useRef<RegistrationData>({});
  const loginData = useRef<LoginData>({});
  const lastSummaryActionRef = useRef<
    { type: "confirmed" } | { type: "edit"; field: string } | null
  >(null);
  const [registrationSummary, setRegistrationSummary] = useState<{
    countryName?: string;
    country?: string;
  }>({});
  const [showSuggestion, setShowSuggestion] = useState(true);
  // Captures CopilotKit's send function so the welcome panel can trigger it.
  const copilotSendRef = useRef<((text: string) => void) | null>(null);

  // Input wrapper that bridges V1 CopilotChat props (onSend, inProgress) to the
  // V2-shaped SmeepChatInput (onSubmitMessage, isRunning).  No dep on
  // showSuggestion so CopilotKit never remounts the input on state change.
  const LandingInput = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      const onSubmitMessage = (text: string) => {
        setShowSuggestion(false);
        // V1 passes onSend; call it so CopilotKit processes the message
        return props.onSend?.(text);
      };
      // Keep local ref in sync so Register/Login CTA buttons can trigger sends
      copilotSendRef.current = onSubmitMessage;
      return (
        <SmeepChatInput
          {...props}
          onSubmitMessage={onSubmitMessage}
          isRunning={props.inProgress ?? props.isRunning ?? false}
        />
      );
    },
    [],
  );

  const handleRegisterClick = () => {
    setShowSuggestion(false);
    // Small delay lets React flush the state before CopilotKit processes the send.
    setTimeout(() => copilotSendRef.current?.("I want to register"), 50);
  };

  const handleLoginClick = () => {
    router.push("/login");
  };

  // Auto-start: wait for CopilotKit's input to register its send function,
  // then kick off registration once (same message the welcome button sends).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      if (copilotSendRef.current) {
        autoStartedRef.current = true;
        window.clearInterval(id);
        handleRegisterClick();
      } else if (tries > 50) {
        window.clearInterval(id);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [autoStart]);

  // Forward system prompt to LangGraph backend via body.context
  useCopilotReadable({
    description: "__system_prompt__",
    value: ASSISTANT_INSTRUCTIONS,
  });

  // Expose non-sensitive registration data to the LLM (no password, no token)
  useCopilotReadable({
    description: "Current registration data collected so far",
    value: registrationSummary,
  });

  // ── Action 1: checkEmailAvailability ─────────────────────────────────────
  useCopilotAction({
    name: "checkEmailAvailability",
    description: "Check if an email address is available for registration",
    parameters: [
      {
        name: "email",
        type: "string",
        required: true,
        description: "Email address to check",
      },
    ],
    handler: async ({ email }) => {
      try {
        const data = await apiFetch<{ success: boolean; data?: { available: boolean } }>("/api/account/check-email", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        if (!data.success) return "error";
        return data.data?.available ? "available" : "taken";
      } catch {
        return "error";
      }
    },
  });

  // ── Action 2: checkCouponCode ────────────────────────────────────────────
  useCopilotAction({
    name: "checkCouponCode",
    description: "Check if an invite/coupon code is valid and available",
    parameters: [
      {
        name: "code",
        type: "string",
        required: true,
        description: "Invite code to check",
      },
    ],
    handler: async ({ code }) => {
      try {
        const normalised = code.trim().toUpperCase();
        const data = await apiFetch<{ success: boolean; data?: { valid: boolean } }>(
          `/api/account/check-coupon?code=${encodeURIComponent(normalised)}`,
        );
        if (!data.success) return "error";
        return data.data?.valid ? "valid" : "invalid";
      } catch {
        return "error";
      }
    },
  });

  // ── Action 3: sendOtp ────────────────────────────────────────────────────
  // Called by the LLM after email is confirmed available. Stores the email in
  // the ref so OtpEntryCard can use it. Never involves a password or token.
  useCopilotAction({
    name: "sendOtp",
    description: "Send a one-time verification code to the given email address",
    parameters: [
      { name: "email", type: "string", required: true, description: "Email to send the OTP to" },
    ],
    handler: async ({ email }) => {
      try {
        registrationData.current.email = email;
        await apiFetch("/api/auth/amplify/sign-up/send-code", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        return "sent";
      } catch {
        return "error";
      }
    },
  });

  // ── Action 4: showOtpEntry ────────────────────────────────────────────────
  // renderAndWaitForResponse: renders OtpEntryCard which handles the API call
  // internally. The card calls respond with { verified, verifiedToken } on
  // success. The parent persists verifiedToken BEFORE forwarding to the LLM.
  // The LLM only ever sees a non-sensitive string ('Email verified' / 'Verification cancelled').
  useCopilotAction({
    name: "showOtpEntry",
    description: "Show a secure in-chat card for the user to enter their email verification code",
    parameters: [],
    renderAndWaitForResponse: ({ respond, status }) => (
      <OtpEntryCard
        email={registrationData.current.email ?? ""}
        status={status}
        respond={(result) => {
          if (result.verified && result.verifiedToken) {
            // Persist the token in the ref — never forwarded to LLM
            registrationData.current.verifiedToken = result.verifiedToken;
          }
          // Forward only a non-sensitive string to the LLM
          respond?.(result.verified ? "Email verified" : "Verification cancelled");
        }}
      />
    ),
  });

  // ── Action 5: showCountryPicker ───────────────────────────────────────────
  useCopilotAction({
    name: "showCountryPicker",
    description:
      "Show an interactive country selection picker for the user to choose their country",
    parameters: [],
    renderAndWaitForResponse: ({ respond, status }) => (
      <CountryPickerCard
        status={status}
        respond={(result) => {
          // Persist the selection before CopilotKit forwards the result to the LLM
          registrationData.current.country = result.countryCode;
          registrationData.current.countryName = result.countryName;
          setRegistrationSummary((prev) => ({
            ...prev,
            country: result.countryCode,
            countryName: result.countryName,
          }));
          respond?.(`Country selected: ${result.countryName} (${result.countryCode})`);
        }}
      />
    ),
  });

  // ── Action 6: showRegistrationSummary ─────────────────────────────────────
  // NOTE: verifiedToken and password are intentionally absent from parameters.
  // NOTE: renderAndWaitForResponse may be called twice in React StrictMode;
  // the writes below are idempotent (same values), so double-invocation is harmless.
  useCopilotAction({
    name: "showRegistrationSummary",
    description:
      "Show a summary of all collected registration details for the user to review and confirm",
    parameters: [
      { name: "fullName", type: "string", required: true, description: "Full name collected" },
      { name: "email", type: "string", required: true, description: "Email address collected" },
      {
        name: "couponCode",
        type: "string",
        required: true,
        description: "The invite code (required)",
      },
    ],
    renderAndWaitForResponse: ({ args, respond, status }) => {
      // Populate ref with non-sensitive fields so the confirm card can display them.
      if (args?.fullName) registrationData.current.fullName = args.fullName;
      if (args?.email) registrationData.current.email = args.email;
      // Only update couponCode when explicitly provided to avoid clearing it on re-invocation
      if (args?.couponCode !== undefined) {
        registrationData.current.couponCode = args.couponCode || undefined;
      }
      return (
        <RegistrationConfirmCard
          data={registrationData.current}
          status={status}
          completedAction={lastSummaryActionRef.current}
          respond={(result) => {
            lastSummaryActionRef.current =
              result.action === "confirmed"
                ? { type: "confirmed" }
                : { type: "edit", field: result.field };
            if (result.action === "confirmed") {
              respond?.("User confirmed registration. Call submitRegistration now.");
            } else {
              respond?.(`User wants to edit field: ${result.field}`);
            }
          }}
        />
      );
    },
  });

  // ── Action 7: submitRegistration ──────────────────────────────────────────
  // country and verifiedToken are read from registrationData.current (ref),
  // never from LLM params. The LLM passes only non-sensitive fields.
  useCopilotAction({
    name: "submitRegistration",
    description: "Submit the registration with all collected data",
    parameters: [
      { name: "fullName", type: "string", required: true, description: "Full name of the user" },
      { name: "email", type: "string", required: true, description: "Email address" },
      { name: "couponCode", type: "string", required: true, description: "The invite code (required)" },
    ],
    handler: async ({ fullName, email, couponCode: rawCoupon }) => {
      // The full name, as the sign-up form saves it (not the picker's ISO code).
      const country = registrationData.current.countryName ?? registrationData.current.country;
      const verifiedToken = registrationData.current.verifiedToken; // read from ref, never from LLM params
      const couponCode = rawCoupon?.trim().toUpperCase();
      // AI Amplify is invite-only; the server refuses a sign-up without a valid code too.
      if (!couponCode) return { error: true, code: "INVALID_COUPON", message: "An invite code is required" };
      if (!country || !verifiedToken) return { error: true, message: "Missing required fields" };
      try {
        // Creates the account and signs in (session cookie).
        await apiFetch("/api/auth/amplify/sign-up", {
          method: "POST",
          body: JSON.stringify({ fullName, email, country, couponCode, verifiedToken }),
        });
        await refreshUser();
        router.push("/dashboard");
        return { success: true };
      } catch (err: unknown) {
        const body = err as { code?: string; message?: string };
        return { error: true, code: body?.code, message: body?.message ?? "Network error" };
      }
    },
  });

  // ── Action 8: sendLoginCode ──────────────────────────────────────────────
  // Emails a sign-in code. Better Auth only sends it when the email has an
  // account, but answers the same either way, so the chat can't be used to
  // find out who is registered.
  useCopilotAction({
    name: "sendLoginCode",
    description: "Email a 6-digit sign-in code to the given address",
    parameters: [{ name: "email", type: "string", required: true, description: "Email address to sign in with" }],
    handler: async ({ email }) => {
      loginData.current.email = email.trim().toLowerCase();
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email: loginData.current.email, type: "sign-in" });
      if (!error) return "sent";
      return error.status === 429 ? "rate_limited" : "error";
    },
  });

  // ── Action 9: showLoginCodeEntry ─────────────────────────────────────────
  // The code is typed into the card and checked by Better Auth there; the
  // model only ever hears 'Signed in' or 'Sign-in cancelled'.
  useCopilotAction({
    name: "showLoginCodeEntry",
    description: "Show a secure in-chat card for the user to enter their sign-in code",
    parameters: [],
    renderAndWaitForResponse: ({ respond, status }) => (
      <OtpEntryCard
        purpose="sign-in"
        email={loginData.current.email ?? ""}
        status={status}
        respond={async (result) => {
          if (result.verified) {
            const user = await refreshUser();
            respond?.("Signed in");
            router.push(user ? homeFor(user.role) : "/dashboard");
            return;
          }
          respond?.("Sign-in cancelled");
        }}
      />
    ),
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface text-ui-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-ui-line px-4 py-3">
        <img
          src="/images/redesign/anna-avatar-96.png"
          alt=""
          className="h-9 w-9 rounded-full object-cover object-top"
        />
        <div className="flex flex-col">
          <p className="text-sm font-semibold leading-tight">Anna</p>
          <p className="text-xs text-ui-muted">Here to get you started</p>
        </div>
      </div>

      {/* Welcome panel — shown before the conversation starts */}
      {showSuggestion && !autoStart && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-6">
          <img
            src="/images/redesign/anna-avatar-200.png"
            alt=""
            className="h-24 w-24 rounded-full object-cover object-top shadow-[0_0_0_4px_var(--ui-brand-soft)]"
          />
          <div className="flex flex-col gap-1.5 text-center">
            <p className="text-xl font-semibold tracking-[-0.01em]">Hi! I&apos;m Anna</p>
            <p className="mx-auto max-w-[280px] text-sm leading-relaxed text-ui-muted">
              Have an invite? Register here, or log in to your account.
            </p>
          </div>
          <div className="flex w-full max-w-[280px] flex-col gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-ui-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-ui-brand-hover"
              onClick={handleRegisterClick}
              suppressHydrationWarning
            >
              I want to register
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-[10px] border border-ui-line bg-ui-surface px-4 text-sm font-semibold text-ui-text transition-colors hover:bg-ui-surface-2"
              onClick={handleLoginClick}
              suppressHydrationWarning
            >
              I want to log in
            </button>
          </div>
        </div>
      )}

      {/* Chat — always mounted so CopilotKit stays initialised; hidden behind welcome panel */}
      <div className={cn("smeep-copilot overflow-hidden", showSuggestion && !autoStart ? "h-0" : "min-h-0 flex-1")}>
        <CopilotChat
          className="h-full"
          labels={{
            title: "",
            placeholder: "Ask me anything",
            initial: "Welcome to AI Amplify! I can help you register with your invite code, log in, or answer questions about the program.",
          }}
          AssistantMessage={LandingAssistantMessage}
          UserMessage={LandingUserMessage}
          Input={LandingInput}
        />
      </div>
    </div>
  );
}
