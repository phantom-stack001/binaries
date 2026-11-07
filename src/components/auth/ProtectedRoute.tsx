import { Navigate, useLocation } from "react-router-dom";

import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import { authClient } from "@/lib/auth-client";
import { useAccountGate } from "@/hooks/useAccountGate";
import { useAuthorization } from "@/lib/authorization";

type ProtectedRouteProps = {
  children: React.ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { pathname } = useLocation();
  const { data: session, isPending } = authClient.useSession();
  const gate = useAccountGate();
  const authorization = useAuthorization();

  if (isPending || gate.loading) {
    return <AuthLoadingScreen />;
  }

  if (!session?.user) {
    const redirect = encodeURIComponent(pathname);
    return <Navigate to={`/login/?redirect=${redirect}`} replace />;
  }

  if (!session.user.emailVerified) {
    return <Navigate to="/verify-email/" replace state={{ email: session.user.email }} />;
  }

  if (gate.mustChangePassword && !pathname.startsWith("/app/change-password")) {
    return <Navigate to="/app/change-password/" replace />;
  }

  if (
    gate.twoFactorEnforcementRequired &&
    !pathname.startsWith("/app/settings/security") &&
    !pathname.startsWith("/app/settings/profile")
  ) {
    return <Navigate to="/app/settings/profile/" replace />;
  }

  const section: "compose" | "drafts" | "campaigns" | "recipients" | "templates" | "history" | "roles" | "auditLog" | null = pathname.startsWith("/app/compose/") ? "compose"
    : pathname.startsWith("/app/drafts/") ? "drafts"
      : pathname.startsWith("/app/campaigns/") ? "campaigns"
        : pathname.startsWith("/app/recipients/") ? "recipients"
          : pathname.startsWith("/app/templates/") ? "templates"
            : pathname.startsWith("/app/history/") ? "history"
              : pathname.startsWith("/app/admin/roles/") ? "roles"
                : pathname.startsWith("/app/admin/audit/") || pathname.startsWith("/app/admin/audit-logs/") ? "auditLog"
                  : null;
  if (authorization.loaded && section && !authorization.features[section]) {
    return <Navigate to="/app/" replace />;
  }

  return children;
}
