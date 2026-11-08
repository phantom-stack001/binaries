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

const SUPER_ADMIN_NAV = [
  "mailbox.read", "mailbox.manage_connection", "mailbox.send_test", "mailbox.send",
  "users.read", "users.create", "users.update", "users.deactivate", "users.delete", "users.invite",
  "users.reset_password", "users.manage_sessions", "roles.read", "roles.create", "roles.update",
  "roles.delete", "roles.assign", "permissions.read", "permissions.manage", "drafts.read", "drafts.create",
  "drafts.update", "drafts.delete", "templates.read", "templates.create", "templates.update", "templates.delete",
  "contacts.read", "contacts.create", "contacts.update", "contacts.delete", "contacts.import", "contacts.export",
  "lists.read", "lists.create", "lists.update", "lists.delete", "campaigns.read", "campaigns.create",
  "campaigns.update", "campaigns.delete", "campaigns.prepare", "campaigns.cancel", "queue.read", "queue.enqueue",
  "queue.pause", "queue.resume", "queue.cancel", "queue.retry", "history.read", "settings.read", "settings.update",
  "audit.read",
];

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

  const permissions = new Set(serverPermissions ?? []);
  if (role.split(",").includes("super-admin")) {
    for (const permission of SUPER_ADMIN_NAV) permissions.add(permission);
  }

  return {
    permissions,
    features,
    allowListCreation,
    can: (permission: string) => permissions.has(permission),
    loaded: serverPermissions !== null,
  };
}
