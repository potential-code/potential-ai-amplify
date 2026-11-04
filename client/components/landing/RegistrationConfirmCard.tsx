"use client";

import { useEffect, useRef } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { LEGAL_LINKS } from "@/lib/constants/navigation";

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full name",
  email: "Email",
  country: "Country",
  couponCode: "Invite code",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistrationData {
  fullName?: string;
  email?: string;
  country?: string; // country code e.g. "NG"
  countryName?: string; // display name e.g. "Nigeria"
  couponCode?: string;
}

interface RegistrationConfirmCardProps {
  data: RegistrationData;
  respond: (value: ConfirmResponse) => void;
  status: "inProgress" | "executing" | "complete";
  completedAction?: { type: "confirmed" } | { type: "edit"; field: string } | null;
}

type EditableField = "fullName" | "email" | "country" | "couponCode";

type ConfirmResponse = { action: "confirmed" } | { action: "edit"; field: EditableField };

// ---------------------------------------------------------------------------
// Flag emoji helper — converts a 2-letter ISO 3166-1 alpha-2 code to a flag
// emoji using Unicode Regional Indicator symbols (U+1F1E6–U+1F1FF).
// "NG" → 🇳🇬
// ---------------------------------------------------------------------------
function countryFlag(code: string): string {
  return code.toUpperCase().replace(/./gu, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Divider() {
  return <div className="h-px bg-ui-line" />;
}

interface RowProps {
  label: string;
  value: string;
  field: EditableField;
  disabled: boolean;
  onEdit: (field: EditableField) => void;
}

function DataRow({ label, value, field, disabled, onEdit }: RowProps) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-2 py-2 pl-3 pr-1.5">
      <span className="text-xs text-ui-muted">{label}</span>
      <span className="truncate text-sm font-medium text-ui-text">{value || "None"}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onEdit(field)}
        className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-ui-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-text disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Edit ${label.toLowerCase()}`}
      >
        <Pencil className="h-[15px] w-[15px]" aria-hidden />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RegistrationConfirmCard({
  data,
  respond,
  status,
  completedAction,
}: RegistrationConfirmCardProps) {
  const respondedRef = useRef(false);
  const isDisabled = status === "complete" || respondedRef.current;
  const showSpinner = respondedRef.current && status === "executing";

  useEffect(() => {
    if (status === "inProgress") {
      respondedRef.current = false;
    }
  }, [status]);

  function handleEdit(field: EditableField) {
    if (isDisabled || respondedRef.current) return;
    respondedRef.current = true;
    respond({ action: "edit", field });
  }

  function handleConfirm() {
    if (isDisabled || respondedRef.current) return;
    respondedRef.current = true;
    respond({ action: "confirmed" });
  }

  // Build the country display string
  const countryDisplay =
    data.countryName && data.country
      ? `${countryFlag(data.country)} ${data.countryName}`
      : (data.countryName ?? data.country ?? "");

  return (
    <div className="my-2 w-full max-w-[380px] overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface text-ui-text">
      <div className="border-b border-ui-line px-4 py-3">
        <span className="text-sm font-semibold">Confirm your details</span>
      </div>

      {status === "complete" ? (
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ui-brand-soft text-ui-brand-text">
            {completedAction?.type === "edit" ? (
              <Pencil className="h-4 w-4" aria-hidden />
            ) : (
              <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            )}
          </span>
          <span className="text-sm font-medium">
            {completedAction?.type === "edit"
              ? `Updating your ${(FIELD_LABELS[completedAction.field] ?? completedAction.field).toLowerCase()}`
              : "Registration submitted"}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          <div className="overflow-hidden rounded-[10px] border border-ui-line">
          {/* -------------------------------------------------------------- */}
          {/* Data rows                                                        */}
          {/* -------------------------------------------------------------- */}

          {data.fullName !== undefined && (
            <>
              <DataRow
                label="Full name"
                value={data.fullName}
                field="fullName"
                disabled={isDisabled}
                onEdit={handleEdit}
              />
              <Divider />
            </>
          )}

          {data.email !== undefined && (
            <>
              <DataRow
                label="Email"
                value={data.email}
                field="email"
                disabled={isDisabled}
                onEdit={handleEdit}
              />
              <Divider />
            </>
          )}

          {countryDisplay && (
            <>
              <DataRow
                label="Country"
                value={countryDisplay}
                field="country"
                disabled={isDisabled}
                onEdit={handleEdit}
              />
              {data.couponCode !== undefined && <Divider />}
            </>
          )}

          {data.couponCode !== undefined && (
            <DataRow
              label="Invite code"
              value={data.couponCode}
              field="couponCode"
              disabled={isDisabled}
              onEdit={handleEdit}
            />
          )}

          </div>
          <p className="text-xs leading-normal text-ui-muted">
            By clicking Confirm and register you agree to our{" "}
            <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="font-semibold text-ui-brand-text hover:underline">
              Terms of Use
            </a>{" "}
            and{" "}
            <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="font-semibold text-ui-brand-text hover:underline">
              Privacy Policy
            </a>
            .
          </p>
          <button
            type="button"
            disabled={isDisabled}
            onClick={handleConfirm}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-ui-brand text-sm font-semibold text-white transition-colors hover:bg-ui-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showSpinner ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>Registering</span>
              </>
            ) : (
              "Confirm and register"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
