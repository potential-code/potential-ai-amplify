"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface SetPasswordModalProps {
  onSuccess: () => void;
}

export function SetPasswordModal({ onSuccess }: SetPasswordModalProps) {
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function validate() {
    const e: Record<string, string> = {};
    if (form.password.length < 8) e.password = "Must be at least 8 characters";
    if (form.password !== form.confirm) e.confirm = "Passwords don't match";
    return e;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/auth/set-password", {
        method: "POST",
        body: JSON.stringify({ password: form.password, confirm: form.confirm }),
      });
      onSuccess();
    } catch (err: unknown) {
      const body = err as {
        error?: { code?: string; message?: string; errors?: Record<string, string[]> };
      };
      const code = body?.error?.code;
      if (code === "PASSWORD_MISMATCH") {
        setErrors({ confirm: "Passwords don't match" });
      } else if (code === "PASSWORD_ALREADY_SET") {
        // Already set — just close; the gate will re-fetch and dismiss
        onSuccess();
      } else if (code === "VALIDATION_ERROR" && body?.error?.errors) {
        const mapped: Record<string, string> = {};
        for (const [k, msgs] of Object.entries(body.error.errors)) {
          mapped[k] = Array.isArray(msgs) ? (msgs[0] ?? "") : String(msgs);
        }
        setErrors(mapped);
      } else {
        setServerError(body?.error?.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  function update(key: "password" | "confirm", value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
    if (serverError) setServerError(null);
  }

  return (
    // Blocking overlay — no onClick dismiss, no close button
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="set-password-title"
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden border"
        style={{ background: "rgba(20, 10, 16, 0.97)", borderColor: "rgba(255,255,255,0.10)" }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ background: "linear-gradient(120deg, var(--color-brand-primary), var(--color-brand-primary-dark))" }}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/15">
            <KeyRound className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 id="set-password-title" className="text-sm font-semibold text-white leading-tight">
              Set Your Password
            </h2>
            <p className="text-white/60 text-[11px] mt-0.5">Required to secure your account</p>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">
          <p className="text-sm text-white/55 leading-relaxed">
            Your account was created without a password. Set one now to enable direct login.
          </p>

          {/* Server error */}
          {serverError && (
            <div className="rounded-lg px-4 py-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20">
              {serverError}
            </div>
          )}

          {/* Password field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                disabled={saving}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="w-full rounded-lg px-4 py-2.5 pr-11 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: errors.password
                    ? "1px solid rgba(239,68,68,0.6)"
                    : "1px solid rgba(255,255,255,0.12)",
                }}
                aria-describedby={errors.password ? "pw-error" : undefined}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p id="pw-error" className="text-xs text-red-400/90">
                {errors.password}
              </p>
            )}
          </div>

          {/* Confirm field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={form.confirm}
                onChange={(e) => update("confirm", e.target.value)}
                disabled={saving}
                placeholder="Repeat your password"
                autoComplete="new-password"
                className="w-full rounded-lg px-4 py-2.5 pr-11 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: errors.confirm
                    ? "1px solid rgba(239,68,68,0.6)"
                    : "1px solid rgba(255,255,255,0.12)",
                }}
                aria-describedby={errors.confirm ? "confirm-error" : undefined}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors"
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirm && (
              <p id="confirm-error" className="text-xs text-red-400/90">
                {errors.confirm}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(120deg, var(--color-brand-primary), var(--color-brand-primary-dark))" }}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving…</span>
              </>
            ) : (
              "Set Password"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
