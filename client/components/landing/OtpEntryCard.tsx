"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface OtpEntryCardProps {
  email: string;
  respond: (value: { verified: boolean; verifiedToken?: string }) => void;
  status: "inProgress" | "executing" | "complete";
}

export function OtpEntryCard({ email, respond, status }: OtpEntryCardProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
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

  async function handleVerify() {
    if (isDisabled || respondedRef.current || verifying) return;
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setError("Please enter the full 6-digit code.");
      return;
    }
    setError(null);
    setVerifying(true);
    try {
      const data = await apiFetch<{
        success: boolean;
        data?: { verifiedToken: string };
        error?: { code: string; message: string };
      }>("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, code: trimmed }),
      });
      if (data.success && data.data?.verifiedToken) {
        respondedRef.current = true;
        lastVerifiedRef.current = true;
        respond({ verified: true, verifiedToken: data.data.verifiedToken });
      } else {
        setError("Incorrect or expired code. Try again.");
      }
    } catch (err: unknown) {
      const body = err as { error?: { code?: string } };
      const code_ = body?.error?.code;
      if (code_ === "INVALID_OTP") {
        setError("Incorrect or expired code. Try again.");
      } else if (code_ === "OTP_LOCKED") {
        setError("Too many attempts — please resend a new code.");
      } else if (code_ === "RATE_LIMITED") {
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
      await apiFetch("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setCode("");
      setResendCooldown(60);
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(val);
    if (error) setError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && code.trim().length === 6) {
      handleVerify();
    }
  }

  return (
    <div
      className="my-2 rounded-xl overflow-hidden border"
      style={{
        background: "rgba(20, 10, 16, 0.90)",
        borderColor: "rgba(255,255,255,0.10)",
        maxWidth: "340px",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: "linear-gradient(120deg,#652d90,#4a2168)" }}
      >
        <Sparkles className="w-4 h-4 text-white/80 flex-shrink-0" />
        <span className="text-sm font-semibold text-white tracking-wide">
          Enter Verification Code
        </span>
      </div>

      {/* Complete state */}
      {status === "complete" ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-white/10">
            <Check className="w-3.5 h-3.5 text-[#652d90]" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-medium text-white/90">
            {lastVerifiedRef.current ? "Email verified" : "Verification cancelled"}
          </span>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {/* Description */}
          <p className="text-xs text-white/55 leading-relaxed">
            A 6-digit code was sent to <span className="text-white/80 font-medium">{email}</span>.
            Enter it below — do not share it with anyone.
          </p>

          {/* Code input */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={handleCodeChange}
              onKeyDown={handleKeyDown}
              disabled={isDisabled || verifying}
              placeholder="000000"
              className="w-full rounded-lg px-4 py-3 text-center text-xl font-bold tracking-[0.5em] text-white/90 outline-none transition-colors placeholder:text-white/20 placeholder:tracking-[0.5em] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: error
                  ? "1px solid rgba(239,68,68,0.6)"
                  : "1px solid rgba(255,255,255,0.12)",
              }}
              aria-label="Verification code"
            />
            {(verifying || showSpinner) && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-[#652d90]" />
              </div>
            )}
          </div>

          {/* Inline error */}
          {error && <p className="text-xs text-red-400/90 leading-snug">{error}</p>}

          {/* Verify button */}
          <button
            type="button"
            disabled={isDisabled || verifying || code.trim().length !== 6}
            onClick={handleVerify}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(120deg,#652d90,#4a2168)" }}
          >
            {verifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying…</span>
              </>
            ) : (
              "Verify"
            )}
          </button>

          {/* Resend link */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              disabled={resendCooldown > 0 || resending || isDisabled}
              onClick={handleResend}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : resending
                  ? "Sending…"
                  : "Didn't get it? Resend"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
