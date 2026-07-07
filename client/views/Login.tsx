"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, ArrowRight, RefreshCw, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { FloatingField } from "@/components/auth/FloatingField";
import { setAuth, type User } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

// ─── Validators ──────────────────────────────────────────────────────────────

const validateEmail = (v: string) =>
  !v
    ? "Enter your email"
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
      ? "Enter a valid email address"
      : null;

const validatePassword = (v: string) =>
  !v ? "Enter your password" : v.length < 6 ? "Password must be at least 6 characters" : null;

// ─── Shared types ─────────────────────────────────────────────────────────────

interface LoginResponse {
  success: boolean;
  data: {
    token: string;
    user: User;
  };
}

type Mode = "password" | "otp-email" | "otp-code";

// ─── Role-based routing helper ────────────────────────────────────────────────

function routeByRole(role: string, router: ReturnType<typeof useRouter>) {
  if (role === "admin") {
    router.push("/admin/dashboard");
  } else if (role === "mentor") {
    router.push("/mentor/dashboard");
  } else {
    router.push("/dashboard");
  }
}

// ─── Primary button (shared visual) ──────────────────────────────────────────

interface PrimaryButtonProps {
  loading: boolean;
  loadingLabel: string;
  label: string;
  disabled?: boolean;
}

function PrimaryButton({ loading, loadingLabel, label, disabled }: PrimaryButtonProps) {
  return (
    <motion.button
      type="submit"
      disabled={loading || disabled}
      whileTap={{ scale: 0.98 }}
      className="relative w-full inline-flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-80 disabled:cursor-wait text-white py-3.5 rounded-xl text-sm font-semibold transition-colors mt-2 shadow-[0_10px_30px_-10px_rgba(101,45,144,0.7)] overflow-hidden"
    >
      {loading && (
        <span
          aria-hidden
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent"
          style={{ animation: "shimmer 1.4s linear infinite", backgroundSize: "200% 100%" }}
        />
      )}
      <span className="relative inline-flex items-center gap-2">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {loadingLabel}
          </>
        ) : (
          <>
            {label}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </span>
    </motion.button>
  );
}

// ─── Inline error banner (shared) ─────────────────────────────────────────────

function InlineError({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <p className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-rose-600 text-center">
      {message}
      {children}
    </p>
  );
}

// ─── Back link ────────────────────────────────────────────────────────────────

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-brand-primary hover:text-brand-primary-dark font-medium transition-colors"
    >
      {label}
    </button>
  );
}

// ─── OTP code input + verify form ─────────────────────────────────────────────

interface OtpCodeFormProps {
  email: string;
  onSuccess: (token: string, user: User) => void;
  onBack: () => void;
}

function OtpCodeForm({ email, onSuccess, onBack }: OtpCodeFormProps) {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Start cooldown on mount (we just sent the code)
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(val);
    if (inlineError) setInlineError(null);
    if (notFound) setNotFound(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setInlineError("Enter the full 6-digit code.");
      return;
    }
    setVerifying(true);
    setInlineError(null);
    setNotFound(false);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/login-otp", {
        method: "POST",
        body: JSON.stringify({ email, code: trimmed }),
      });
      onSuccess(res.data.token, res.data.user);
    } catch (err: unknown) {
      const body = err as { error?: { code?: string } };
      const errCode = body?.error?.code;
      if (errCode === "INVALID_OTP") {
        setInlineError("Incorrect or expired code. Try again.");
      } else if (errCode === "OTP_LOCKED") {
        setInlineError("Too many attempts — request a new code.");
      } else if (errCode === "RATE_LIMITED") {
        setInlineError("Too many requests, please wait a moment.");
      } else if (errCode === "ACCOUNT_NOT_FOUND") {
        setNotFound(true);
      } else {
        toast.error("Something went wrong", { description: "Please try again." });
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setInlineError(null);
    try {
      await apiFetch("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setCode("");
      setResendCooldown(60);
    } catch {
      setInlineError("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4">
      {/* Context */}
      <p className="text-[13px] text-brand-text-secondary leading-relaxed -mt-1">
        A 6-digit code was sent to{" "}
        <span className="font-semibold text-brand-text-primary">{email}</span>. Enter it below.
      </p>

      {/* Errors */}
      {notFound && <InlineError message="No account found for this email." />}
      {inlineError && !notFound && <InlineError message={inlineError} />}

      {/* Code input — single field, numeric, matching card visual language */}
      <div className="relative rounded-xl border border-brand-surface-2 bg-white transition-all focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/20">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-secondary/70 pointer-events-none">
          <KeyRound className="w-4 h-4" />
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={handleCodeChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.trim().length === 6)
              handleVerify(e as unknown as React.FormEvent);
          }}
          disabled={verifying}
          placeholder="000000"
          aria-label="6-digit verification code"
          className="w-full bg-transparent pl-10 pr-4 pt-5 pb-2 text-sm text-brand-text-primary tracking-[0.35em] font-bold placeholder:text-brand-text-secondary/30 placeholder:font-normal placeholder:tracking-[0.35em] focus:outline-none"
        />
        {/* Floating label */}
        <label className="pointer-events-none absolute left-10 top-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-text-secondary">
          Verification Code
        </label>
      </div>

      {/* Verify button */}
      <PrimaryButton
        loading={verifying}
        loadingLabel="Verifying…"
        label="Verify & Log In"
        disabled={code.trim().length !== 6}
      />

      {/* Resend + back links */}
      <div className="flex items-center justify-between text-xs pt-1">
        <button
          type="button"
          disabled={resendCooldown > 0 || resending}
          onClick={handleResend}
          className="flex items-center gap-1.5 text-brand-text-secondary hover:text-brand-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
          {resendCooldown > 0
            ? `Resend in ${resendCooldown}s`
            : resending
              ? "Sending…"
              : "Didn't get it? Resend"}
        </button>

        <BackLink onClick={onBack} label="Back to password login" />
      </div>
    </form>
  );
}

// ─── OTP email capture form ───────────────────────────────────────────────────

interface OtpEmailFormProps {
  initialEmail: string;
  onCodeSent: (email: string) => void;
  onBack: () => void;
}

function OtpEmailForm({ initialEmail, onCodeSent, onBack }: OtpEmailFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    if (emailErr) {
      setFieldError(emailErr);
      return;
    }
    setSending(true);
    setFieldError(null);
    try {
      await apiFetch("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      onCodeSent(email);
    } catch (err: unknown) {
      const body = err as { error?: { message?: string } };
      setFieldError(body?.error?.message ?? "Failed to send code. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-[13px] text-brand-text-secondary -mt-1">
        Enter your email and we'll send you a one-time login code.
      </p>

      <FloatingField
        type="email"
        label="Email Address"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setFieldError(null);
        }}
        icon={<Mail className="w-4 h-4" />}
        validator={validateEmail}
        externalError={fieldError}
      />

      <PrimaryButton loading={sending} loadingLabel="Sending code…" label="Send Code" />

      <div className="text-xs text-center pt-1">
        <BackLink onClick={onBack} label="Back to password login" />
      </div>
    </form>
  );
}

// ─── Password form ────────────────────────────────────────────────────────────

interface PasswordFormProps {
  onSuccess: (token: string, user: User) => void;
  onOtpLinkClick: (email: string) => Promise<void>;
}

function PasswordForm({ onSuccess, onOtpLinkClick }: PasswordFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLinkLoading, setOtpLinkLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validateEmail(email) || validatePassword(password)) return;

    setLoading(true);
    setFieldError(null);

    try {
      const {
        data: { token, user },
      } = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onSuccess(token, user);
    } catch (err: unknown) {
      const body = err as { error?: { message?: string; code?: string } };
      if (body?.error?.code === "INVALID_CREDENTIALS") {
        setFieldError("Invalid email or password");
      } else {
        toast.error("Something went wrong", { description: "Please try again." });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpLinkClick() {
    setOtpLinkLoading(true);
    try {
      await onOtpLinkClick(email);
    } finally {
      setOtpLinkLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fieldError && <InlineError message={fieldError} />}

      <FloatingField
        type="email"
        label="Email Address"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setFieldError(null);
        }}
        icon={<Mail className="w-4 h-4" />}
        validator={validateEmail}
      />
      <FloatingField
        type={showPassword ? "text" : "password"}
        label="Password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setFieldError(null);
        }}
        icon={<Lock className="w-4 h-4" />}
        validator={validatePassword}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="p-2 text-brand-text-secondary/70 hover:text-brand-primary transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      <div className="flex items-center justify-between text-xs">
        <label className="inline-flex items-center gap-2 text-brand-text-secondary cursor-pointer">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 rounded border-brand-surface-2 accent-brand-primary"
          />
          Remember me
        </label>
        <a
          href="#"
          className="text-brand-primary hover:text-brand-primary-dark font-medium transition-colors"
        >
          Forgot password?
        </a>
      </div>

      <PrimaryButton loading={loading} loadingLabel="Logging in…" label="Log In" />

      {/* OTP alternative */}
      <p className="text-center text-xs text-brand-text-secondary pt-1">
        {otpLinkLoading ? (
          <span className="inline-flex items-center gap-1.5 text-brand-primary">
            <Loader2 className="w-3 h-3 animate-spin" />
            Sending code…
          </span>
        ) : (
          <button
            type="button"
            onClick={handleOtpLinkClick}
            className="text-brand-primary hover:text-brand-primary-dark font-medium transition-colors"
          >
            Log in with OTP instead
          </button>
        )}
      </p>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [otpEmail, setOtpEmail] = useState("");
  const router = useRouter();

  function handleSuccess(token: string, user: User) {
    setAuth(token, user);
    routeByRole(user.role, router);
  }

  // Called from password form's "Log in with OTP" link.
  // If email is valid: send OTP immediately then go to otp-code.
  // If invalid: go to otp-email capture.
  async function handleOtpLinkClick(emailFromForm: string) {
    const isValid = !validateEmail(emailFromForm);
    if (isValid) {
      // Send OTP now and jump straight to code entry
      await apiFetch("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: emailFromForm }),
      });
      setOtpEmail(emailFromForm);
      setMode("otp-code");
    } else {
      // Let user enter their email on the next screen
      setMode("otp-email");
    }
  }

  function handleCodeSent(email: string) {
    setOtpEmail(email);
    setMode("otp-code");
  }

  const subheadings: Record<Mode, string> = {
    password: "Continue your AI-powered business journey.",
    "otp-email": "We'll send a one-time code to your inbox.",
    "otp-code": "Check your inbox for the 6-digit code.",
  };

  return (
    <AuthLayout
      heading={
        <>
          Log in to <span className="text-gradient-brand">AI Amplify</span>
        </>
      }
      subheading={subheadings[mode]}
    >
      <div className="relative rounded-3xl border border-brand-surface-2 bg-white p-7 shadow-[0_20px_60px_-20px_rgba(101,45,144,0.18)]">
        <AnimatePresence mode="wait" initial={false}>
          {mode === "password" && (
            <motion.div
              key="password"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <PasswordForm onSuccess={handleSuccess} onOtpLinkClick={handleOtpLinkClick} />
            </motion.div>
          )}

          {mode === "otp-email" && (
            <motion.div
              key="otp-email"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <OtpEmailForm
                initialEmail=""
                onCodeSent={handleCodeSent}
                onBack={() => setMode("password")}
              />
            </motion.div>
          )}

          {mode === "otp-code" && (
            <motion.div
              key="otp-code"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <OtpCodeForm
                email={otpEmail}
                onSuccess={handleSuccess}
                onBack={() => setMode("password")}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}
