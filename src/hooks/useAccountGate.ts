import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { ACCOUNT_SECURITY_UPDATED_EVENT } from "@/lib/account-security-events";

export type AccountGate = {
  loading: boolean;
  mustChangePassword: boolean;
  twoFactorEnforcementRequired: boolean;
};

type RemoteGate = {
  mustChangePassword: boolean;
  twoFactorEnforcementRequired: boolean;
};

export function useAccountGate(): AccountGate {
  const { data: session, isPending } = authClient.useSession();
  const [remote, setRemote] = useState<RemoteGate | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const userId = session?.user?.id;

  useEffect(() => {
    function refreshAccountGate() {
      setRemote(null);
      setRefreshKey((current) => current + 1);
    }

    window.addEventListener(ACCOUNT_SECURITY_UPDATED_EVENT, refreshAccountGate);
    return () => window.removeEventListener(ACCOUNT_SECURITY_UPDATED_EVENT, refreshAccountGate);
  }, []);

  useEffect(() => {
    if (isPending || !userId) {
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    fetch("/api/account/security", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setRemote({ mustChangePassword: false, twoFactorEnforcementRequired: false });
          return;
        }
        setRemote({
          mustChangePassword: Boolean(payload.security?.mustChangePassword),
          twoFactorEnforcementRequired: Boolean(payload.security?.twoFactorEnforcementRequired),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setRemote({ mustChangePassword: false, twoFactorEnforcementRequired: false });
        }
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isPending, userId, refreshKey]);

  if (isPending) {
    return { loading: true, mustChangePassword: false, twoFactorEnforcementRequired: false };
  }
  if (!session?.user) {
    return { loading: false, mustChangePassword: false, twoFactorEnforcementRequired: false };
  }
  if (!remote) {
    return { loading: true, mustChangePassword: false, twoFactorEnforcementRequired: false };
  }
  return { loading: false, ...remote };
}
