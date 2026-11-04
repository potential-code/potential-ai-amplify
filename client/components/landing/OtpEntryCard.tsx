"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Loader2, Lock, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { OtpInput, type OtpInputHandle } from "@/components/auth/OtpInput";

interface OtpEntryCardProps {
  email: string;
  respond: (value: { verified: boolean; verifiedToken?: string }) => void;
  status: "inProgress" | "executing" | "complete";
  /**
   * "sign-up" (default) proves a new email and hands back a verifiedToken;
   * "sign-in" signs an existing account in with Better Auth's code sign-in.
   */
  purpose?: "sign-up" | "sign-in";
}

export function OtpEntryCard({ email, respond, status, purpose = "sign-up" }: OtpEntryCardProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRef = useRef<OtpInputHandle>(null);
  const respondedRef = useRef(false);
  const lastVerifiedRef = useRef<boolean>(false);

  const isDisabled = status === "complete" || respondedRef.current;
  const showSpinner = respondedRef.current && status === "executing";

  useEffect(() => {
    if (status === "inProgress") {
      setCode("");
      setError(null);
      setVerifying(false);
      respondedRef.current = false;
      inputRef.current?.focus();
    }
  }, [status]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  async function handleVerify(value: string = code) {
    if (isDisabled || respondedRef.current || verifying) return;
    const trimmed = value.trim();
    if (trimmed.length !== 6) {
      setError("Please enter the full 6-digit code.");
      return;
    }
    setError(null);
    setVerifying(true);
    if (purpose === "sign-in") {
      const { error: err } = await authClient.signIn.emailOtp({ email, otp: trimmed });
      setVerifying(false);
      if (err) {
        setError(
          err.status === 429
            ? "Too many tries. Please wait a minute."
            : err.code === "TOO_MANY_ATTEMPTS"
              ? "Too many wrong tries. Please resend a new code."
              : "Incorrect or expired code. Try again.",
        );
        return;
      }
      respondedRef.current = true;
      lastVerifiedRef.current = true;
      respond({ verified: true });
      return;
    }
    try {
      const data = await apiFetch<{ verified?: boolean; verifiedToken?: string }>("/api/auth/amplify/sign-up/verify-code", {
        method: "POST",
        body: JSON.stringify({ email, code: trimmed }),
      });
      if (data.verifiedToken) {
        respondedRef.current = true;
        lastVerifiedRef.current = true;
        respond({ verified: true, verifiedToken: data.verifiedToken });
      } else {
        setError("Incorrect or expired code. Try again.");
      }
    } catch (err: unknown) {
      const body = err as { code?: string; status?: number };
      const code_ = body?.code;
      if (code_ === "INVALID_OTP" || code_ === "OTP_EXPIRED") {
        setError("Incorrect or expired code. Try again.");
      } else if (code_ === "OTP_LOCKED") {
        setError("Too many attempts — please resend a new code.");
      } else if (code_ === "RATE_LIMITED" || body?.status === 429) {
        setError("Too many requests, wait a moment.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      if (purpose === "sign-in") {
        const { error: err } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
        if (err) throw err;
      } else {
        await apiFetch("/api/auth/amplify/sign-up/send-code", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
      }
      setCode("");
      setResendCooldown(60);
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  function handleCodeChange(value: string) {
    setCode(value);
    if (error) setError(null);
  }

  return (
    <div className="my-2 w-full max-w-[340px] overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface text-ui-text">
      <div className="flex items-center gap-2.5 border-b border-ui-line px-4 py-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ui-brand-soft text-ui-brand-text">
          <Lock className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-semibold">Secure verification</span>
          <span className="text-xs text-ui-muted">The code never appears in the chat</span>
        </span>
      </div>

      {status === "complete" ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ui-ok-soft text-ui-ok">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-sm font-medium">
            {lastVerifiedRef.current
              ? purpose === "sign-in"
                ? "Signed in"
                : "Email verified"
              : purpose === "sign-in"
                ? "Sign-in cancelled"
                : "Verification cancelled"}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm leading-normal">
            {purpose === "sign-in" ? (
              <>
                If <strong className="font-semibold">{email}</strong> has a AI Amplify account, we sent it a 6-digit sign-in
                code. Enter it below and do not share it with anyone.
              </>
            ) : (
              <>
                A 6-digit code was sent to <strong className="font-semibold">{email}</strong>. Enter it below and do not
                share it with anyone.
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <OtpInput
              ref={inputRef}
              size="sm"
              value={code}
              onChange={handleCodeChange}
              // The sixth digit verifies straight away.
              onComplete={(value) => void handleVerify(value)}
              disabled={isDisabled || verifying}
              invalid={Boolean(error)}
              aria-label="Verification code"
            />
            {(verifying || showSpinner) && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ui-brand-text" aria-hidden />}
          </div>
          {error && (
            <p role="alert" className="text-xs leading-snug text-ui-danger">
              {error.replace(" — ", ". ").replace("please resend", "Please resend")}
            </p>
          )}
          <button
            type="button"
            disabled={isDisabled || verifying || code.trim().length !== 6}
            onClick={() => void handleVerify()}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-ui-brand text-sm font-semibold text-white transition-colors hover:bg-ui-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>{purpose === "sign-in" ? "Signing in" : "Verifying"}</span>
              </>
            ) : purpose === "sign-in" ? (
              "Sign in"
            ) : (
              "Verify"
            )}
          </button>
          <div className="flex items-center justify-center">
            <button
              type="button"
              disabled={resendCooldown > 0 || resending || isDisabled}
              onClick={handleResend}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ui-brand-text hover:underline disabled:cursor-not-allowed disabled:font-normal disabled:text-ui-muted disabled:no-underline"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} aria-hidden />
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : resending ? "Sending" : "Didn't get it? Resend"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
