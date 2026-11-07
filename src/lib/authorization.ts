import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

export const DEFAULT_APP_FEATURES = {
  compose: true,
  drafts: true,
  campaigns: true,
  recipients: true,
  templates: true,
  history: true,
  roles: true,
  auditLog: true,
} as const;

const SUPER_ADMIN_NAV = ["mailbox.read", "mailbox.send", "users.read", "roles.read", "audit.read"];

export function useAuthorization() {
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const [serverPermissions, setServerPermissions] = useState<string[] | null>(null);
  const [features, setFeatures] = useState<Record<keyof typeof DEFAULT_APP_FEATURES, boolean>>(DEFAULT_APP_FEATURES);
  const [allowListCreation, setAllowListCreation] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => fetch("/api/me", { credentials: "include" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload: { permissions?: string[]; features?: { features?: Record<string, boolean>; allowListCreation?: boolean } } | null) => {
        if (cancelled) return;
        setServerPermissions(payload?.permissions ?? []);
        if (payload?.features?.features) setFeatures({ ...DEFAULT_APP_FEATURES, ...payload.features.features });
        if (typeof payload?.features?.allowListCreation === "boolean") setAllowListCreation(payload.features.allowListCreation);
      })
      .catch(() => {
        if (!cancelled) setServerPermissions([]);
      });
    const onFeaturesChanged = () => void refresh();
    window.addEventListener("app-feature-settings-updated", onFeaturesChanged);
    void refresh();
    return () => {
      cancelled = true;
      window.removeEventListener("app-feature-settings-updated", onFeaturesChanged);
    };
  }, [role]);

  const permissions = new Set(
    serverPermissions ?? (role.split(",").includes("super-admin") ? SUPER_ADMIN_NAV : []),
  );

  return {
    permissions,
    features,
    allowListCreation,
    can: (permission: string) => permissions.has(permission),
    loaded: serverPermissions !== null,
  };
}
