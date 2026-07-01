"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/dashboard/RequireAuth";
import { AssistantProvider } from "@/components/dashboard/AssistantProvider";
import { QueryProvider } from "@/components/QueryProvider";
import { SetPasswordModal } from "@/components/dashboard/SetPasswordModal";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// MandatorySetPasswordGate
// Fetches /api/auth/me after mount. If hasPassword === false, renders the
// blocking SetPasswordModal over children. Refetches on success to dismiss.
// Must be inside QueryProvider (so apiFetch has token context) but is a plain
// client component — no react-query needed for a single one-off fetch.
// ---------------------------------------------------------------------------

function MandatorySetPasswordGate({ children }: { children: ReactNode }) {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  function fetchMe() {
    apiFetch<{ success: boolean; data: { user: { hasPassword: boolean } } }>("/api/auth/me")
      .then(({ data }) => setHasPassword(data.user.hasPassword))
      .catch(() => setHasPassword(true)); // on error, don't block — fail open
  }

  useEffect(() => {
    fetchMe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {children}
      {hasPassword === false && <SetPasswordModal onSuccess={fetchMe} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth role="sme">
      <QueryProvider>
        <AssistantProvider>
          <MandatorySetPasswordGate>{children}</MandatorySetPasswordGate>
        </AssistantProvider>
      </QueryProvider>
    </RequireAuth>
  );
}
