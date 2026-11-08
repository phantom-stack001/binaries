import { useEffect, useState } from "react";

import { PageMeta } from "@/components/layout/PageMeta";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  ["compose", "Compose", "Create and send individual messages."],
  ["drafts", "Drafts", "Save and manage message drafts."],
  ["campaigns", "Campaigns", "Create and manage email campaigns."],
  ["recipients", "Recipients", "Manage contacts, lists, and suppressions."],
  ["templates", "Templates", "Access the template library."],
  ["history", "History", "View individual message sending history."],
  ["roles", "Roles", "Manage application roles and permissions."],
  ["auditLog", "Audit log", "View administrative audit records."],
] as const;

type Settings = {
  features: Record<(typeof FEATURES)[number][0], boolean>;
  allowListCreation: boolean;
};

export function FeatureSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/feature-settings", { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load feature settings.");
        setSettings(payload.settings);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load feature settings."))
      .finally(() => setLoading(false));
  }, []);

  const save = async (change: { features?: Partial<Settings["features"]>; allowListCreation?: boolean }) => {
    if (!settings || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/feature-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not save feature settings.");
      setSettings(payload.settings);
      window.dispatchEvent(new Event("app-feature-settings-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save feature settings.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (label: string, description: string, enabled: boolean, onChange: () => void) => (
    <div key={label} className="flex items-center justify-between gap-4 border-b py-4 last:border-b-0">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label}: ${enabled ? "enabled" : "disabled"}`}
        disabled={busy}
        onClick={onChange}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 ${enabled ? "bg-primary" : "bg-muted-foreground/40"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );

  return (
    <>
      <PageMeta title="Feature settings | Binaries.nl" description="Enable or disable application features." canonicalPath="/app/admin/features/" />
      <AppPageContainer width="wide">
        <PageHeader title="Feature settings" description="Control which application areas are available to users. Changes apply across the app." />
        {error ? <p role="alert" className="mb-4 text-sm text-destructive">{error}</p> : null}
        {loading ? <p className="text-sm text-muted-foreground">Loading feature settings…</p> : null}
        {!loading && !settings && !error ? <p className="text-sm text-muted-foreground">Feature settings are unavailable.</p> : null}
        {!loading && settings ? (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Application features</CardTitle>
                <CardDescription>Disabled sections disappear from navigation and their APIs become unavailable.</CardDescription>
              </CardHeader>
              <CardContent>
                {FEATURES.map(([key, title, description]) => toggle(
                  title,
                  description,
                  settings.features[key],
                  () => void save({ features: { [key]: !settings.features[key] } as Partial<Settings["features"]> }),
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recipient lists</CardTitle>
                <CardDescription>Choose whether users can create new lists. Existing lists remain available.</CardDescription>
              </CardHeader>
              <CardContent>
                {toggle("Allow list creation", "When off, list creation is blocked for all users.", settings.allowListCreation,
                  () => void save({ allowListCreation: !settings.allowListCreation }))}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </AppPageContainer>
    </>
  );
}
