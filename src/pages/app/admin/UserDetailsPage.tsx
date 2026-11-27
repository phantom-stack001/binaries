import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { PageMeta } from "@/components/layout/PageMeta";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validatePassword } from "@/lib/auth-validation";
import { useAuthorization } from "@/lib/authorization";
import { authClient } from "@/lib/auth-client";

type UserDetail = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  roles: string[];
  status: string;
  permissions: string[];
  sessions: { id: string; updatedAt: string; ipAddress: string | null; userAgent: string | null; expiresAt: string }[];
  audit: { id: string; action: string; createdAt: string }[];
  emailVerification?: {
    status: "verified" | "unverified";
    method: "manual" | "unknown" | null;
    verifiedAt: string | null;
    reason: string | null;
  };
};

const ASSIGNABLE = ["viewer", "editor", "campaign-manager", "admin", "user"];
const FALLBACK_SUPER_ADMIN_ROLES = [
  ...ASSIGNABLE.map((key) => ({ key, name: key })),
  { key: "super-admin", name: "Super admin" },
];

export function UserDetailsPage() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const created = Boolean((location.state as { created?: boolean } | null)?.created);
  const [account, setAccount] = useState<UserDetail | null>(null);
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changing, setChanging] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [roleOptions, setRoleOptions] = useState<{ key: string; name: string }[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const { can } = useAuthorization();
  const { data: session } = authClient.useSession();
  const sessionUserId = session?.user?.id ?? "";
  const isSuperAdmin = ((session?.user as { role?: string } | undefined)?.role ?? "")
    .split(",")
    .map((part) => part.trim())
    .includes("super-admin");
  const canDeleteAccount = can("users.delete") && Boolean(sessionUserId) && sessionUserId !== userId;

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    setRolesLoading(true);
    fetch("/api/admin/roles", { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Could not load available roles.");
        if (!cancelled) {
          const available = (payload.roles ?? []) as { key: string; name: string }[];
          setRoleOptions(available.length ? available : FALLBACK_SUPER_ADMIN_ROLES);
        }
      })
      .catch(() => {
        if (!cancelled) setRoleOptions(FALLBACK_SUPER_ADMIN_ROLES);
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false);
      });
    return () => { cancelled = true; };
  }, [isSuperAdmin]);

  async function load(options?: { silent?: boolean }) {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (!options?.silent) {
          setError(typeof payload.error === "string" ? payload.error : "User not found");
        }
        return;
      }
      setAccount(payload.user);
      setName(payload.user.name);
      setRoles(payload.user.roles);
      if (!options?.silent) setError(null);
    } catch {
      if (!options?.silent) setError("Could not load this user.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/users/${userId}`, { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(payload.error ?? "User not found");
          return;
        }
        setAccount(payload.user);
        setName(payload.user.name);
        setRoles(payload.user.roles);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this user.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function save() {
    if (savingProfile) return;
    setError(null);
    setSavingProfile(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Could not update this user.");
        return;
      }
      setAccount(payload.user);
      setName(payload.user.name);
      setMessage("Profile updated.");
    } catch {
      setError("Could not update this user.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveRoles() {
    if (savingRoles || !can("users.update")) return;
    setError(null);
    setMessage(null);
    setSavingRoles(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleKeys: roles }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Could not update this user’s roles.");
        return;
      }
      setAccount(payload.user);
      setRoles(payload.user.roles);
      setMessage("User roles updated.");
    } catch {
      setError("Could not update this user’s roles.");
    } finally {
      setSavingRoles(false);
    }
  }

  async function setStatus(status: "active" | "suspended" | "deactivated") {
    setError(null);
    const response = await fetch(`/api/admin/users/${userId}/status`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Could not change account status.");
      return;
    }
    setAccount(payload.user);
  }

  function openVerify() {
    setAcknowledged(false);
    setError(null);
    setVerifyOpen(true);
  }

  async function confirmVerify() {
    if (!account || verifying || !acknowledged) return;
    setVerifying(true);
    setError(null);
    const response = await fetch(`/api/admin/users/${userId}/verify-email`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmed: true,
        expectedEmail: account.email,
      }),
    });
    const payload = await response.json();
    setVerifying(false);
    if (!response.ok || !payload.user) {
      setError(payload.error ?? "Could not verify this email address.");
      return;
    }
    setAccount(payload.user);
    setName(payload.user.name);
    setRoles(payload.user.roles);
    setAcknowledged(false);
    setVerifyOpen(false);
    setMessage("Email address manually verified.");
  }

  async function resetPassword() {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/admin/users/${userId}/password-reset`, { method: "POST", credentials: "include" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Could not request a password reset.");
      return;
    }
    setMessage("Password reset email requested.");
  }

  function openChangePassword() {
    setError(null);
    setMessage(null);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setRequirePasswordChange(false);
    setChangePasswordOpen(true);
  }

  async function confirmChangePassword() {
    if (!account || changing || !isSuperAdmin) return;
    setError(null);
    setMessage(null);
    const policyError = validatePassword(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setChanging(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: newPassword,
          confirmPassword,
          requirePasswordChange,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Could not update this password.");
        return;
      }
      setChangePasswordOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setRequirePasswordChange(false);
      setError(null);
      setMessage("Password updated.");
      await load({ silent: true });
    } catch {
      setError("Could not update this password.");
    } finally {
      setChanging(false);
    }
  }

  async function revokeSessions() {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/admin/users/${userId}/sessions`, { method: "DELETE", credentials: "include" });
    if (!response.ok) {
      setError("Could not revoke sessions.");
      return;
    }
    setMessage("Sessions revoked.");
    await load({ silent: true });
  }

  function openDelete() {
    setError(null);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!account || deleting || !canDeleteAccount) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, { method: "DELETE", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Could not delete this account.");
        setDeleting(false);
        return;
      }
      navigate("/app/admin/users/", { state: { deleted: true } });
    } catch {
      setError("Could not delete this account.");
      setDeleting(false);
    }
  }

  if (!account) {
    return <AppPageContainer><p className="text-sm text-muted-foreground">{error ?? "Loading account…"}</p></AppPageContainer>;
  }

  return (
    <>
      <PageMeta title={`${account.name} | Binaries.nl`} description="User account details." canonicalPath={`/app/admin/users/${account.id}/`} />
      <AppPageContainer width="wide">
        <PageHeader
          title={account.name}
          description={account.email}
          actions={<Button variant="outline" asChild><Link to="/app/admin/users/">Back</Link></Button>}
        />
        {created ? <p className="text-sm" role="status">User created successfully.</p> : null}
        {error && !verifyOpen && !deleteOpen && !changePasswordOpen ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm" role="status">{message}</p> : null}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Name" />
              <p className="text-sm text-muted-foreground">Email changes require a verification flow and are not changed here.</p>
              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="text-sm font-medium">Email verification</p>
                <p className="break-all text-sm">{account.email}</p>
                <p className="text-sm">Status: {account.emailVerified ? "Verified" : "Unverified"}</p>
                {account.emailVerified ? (
                  <>
                    <p className="text-sm">
                      Verified on: {account.emailVerification?.verifiedAt ? new Date(account.emailVerification.verifiedAt).toLocaleString() : "Not recorded"}
                    </p>
                    <p className="text-sm">
                      Verification method: {account.emailVerification?.method === "manual" ? "Manual" : "Unknown"}
                    </p>
                  </>
                ) : isSuperAdmin ? (
                  <Button type="button" variant="outline" onClick={openVerify}>Verify Email Manually</Button>
                ) : null}
              </div>
              <p className="text-sm capitalize">Status: {account.status}</p>
              <Button type="button" onClick={() => void save()} disabled={savingProfile}>
                {savingProfile ? "Saving…" : "Save profile"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Access</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Choose the roles assigned to this account. Changes take effect after saving.</p>
              {(isSuperAdmin ? roleOptions : ASSIGNABLE.map((key) => ({ key, name: key }))).map(({ key, name: roleName }) => (
                <label key={key} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    className="size-5"
                    type="checkbox"
                    checked={roles.includes(key)}
                    disabled={!can("users.update") || savingRoles}
                    onChange={(event) => {
                      setRoles((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key));
                    }}
                  />
                  <span>{roleName}</span>
                </label>
              ))}
              {isSuperAdmin && rolesLoading ? <p className="text-sm text-muted-foreground">Loading available roles…</p> : null}
              {roles.includes("super-admin") ? <Badge>super-admin</Badge> : null}
              <div className="flex flex-wrap gap-1">
                {account.permissions.slice(0, 12).map((permission) => <Badge key={permission} variant="outline">{permission}</Badge>)}
              </div>
              {can("users.update") ? (
                <Button type="button" onClick={() => void saveRoles()} disabled={savingRoles || rolesLoading}>
                  {savingRoles ? "Saving roles…" : "Save roles"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Security</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void setStatus("suspended")}>Suspend</Button>
                <Button type="button" variant="outline" onClick={() => void setStatus("active")}>Reactivate</Button>
                <Button type="button" variant="outline" onClick={() => void setStatus("deactivated")}>Deactivate</Button>
                <Button type="button" variant="outline" onClick={() => void revokeSessions()}>Revoke sessions</Button>
                <Button type="button" variant="outline" onClick={() => void resetPassword()}>Reset password</Button>
                {isSuperAdmin ? (
                  <Button type="button" variant="outline" onClick={openChangePassword}>Change password</Button>
                ) : null}
                {canDeleteAccount ? (
                  <Button type="button" variant="destructive" onClick={openDelete}>Delete account</Button>
                ) : null}
              </div>
              <ul className="space-y-2 text-sm">
                {account.sessions.map((item) => (
                  <li key={item.id} className="break-words text-muted-foreground">
                    {new Date(item.updatedAt).toLocaleString()} · {item.ipAddress ?? "Unknown IP"} · {item.userAgent ?? "Unknown device"}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {account.audit.length === 0 ? <li className="text-muted-foreground">No administrative events yet.</li> : null}
                {account.audit.map((event) => (
                  <li key={event.id}>{event.action} · {new Date(event.createdAt).toLocaleString()}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
        <Dialog open={verifyOpen} onOpenChange={(open) => { if (!verifying) setVerifyOpen(open); }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Verify Email Manually</DialogTitle>
              <DialogDescription>
                Confirm that you have verified this user&apos;s email address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p className="wrap-break-word"><span className="text-muted-foreground">Name: </span>{account.name}</p>
              <p className="break-all"><span className="text-muted-foreground">Email: </span>{account.email}</p>
              <p><span className="text-muted-foreground">Current status: </span>{account.emailVerified ? "Verified" : "Unverified"}</p>
            </div>
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                className="mt-1 size-5 shrink-0"
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>I confirm that I have verified this user&apos;s email address.</span>
            </label>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={verifying} onClick={() => setVerifyOpen(false)}>Cancel</Button>
              <Button
                type="button"
                disabled={verifying || !acknowledged}
                onClick={() => void confirmVerify()}
              >
                {verifying ? "Verifying…" : "Confirm Verification"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Delete account?</DialogTitle>
              <DialogDescription>
                This permanently removes {account.name}&apos;s account. Their sessions, drafts, campaigns, and contacts are removed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p className="wrap-break-word"><span className="text-muted-foreground">Name: </span>{account.name}</p>
              <p className="break-all"><span className="text-muted-foreground">Email: </span>{account.email}</p>
            </div>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button type="button" variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
                {deleting ? "Deleting…" : "Delete account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={changePasswordOpen} onOpenChange={(open) => { if (!changing) setChangePasswordOpen(open); }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Change password</DialogTitle>
              <DialogDescription>
                Set a new password for {account.name}. Their other sessions will be signed out.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="admin-new-password">New password</Label>
                <Input
                  id="admin-new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-confirm-password">Confirm password</Label>
                <Input
                  id="admin-confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "Hide password" : "Show password"}
              </Button>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  className="mt-1 size-5 shrink-0"
                  type="checkbox"
                  checked={requirePasswordChange}
                  onChange={(event) => setRequirePasswordChange(event.target.checked)}
                />
                <span>Require password change on next sign-in</span>
              </label>
            </div>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={changing} onClick={() => setChangePasswordOpen(false)}>Cancel</Button>
              <Button type="button" disabled={changing || !newPassword || !confirmPassword} onClick={() => void confirmChangePassword()}>
                {changing ? "Updating…" : "Update password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppPageContainer>
    </>
  );
}
