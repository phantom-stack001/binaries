import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const CHECK_INTERVAL_MS = 60_000;

export function DeploymentUpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const checkForUpdate = useCallback(async () => {
    try {
      const response = await fetch("/api/build-version", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { buildId?: unknown };
      if (typeof payload.buildId === "string" && payload.buildId !== __APP_BUILD_ID__) {
        setUpdateAvailable(true);
      }
    } catch {
      // Deployment checks are best-effort and must not interrupt the app.
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV || __APP_BUILD_ID__ === "local") return;

    void checkForUpdate();
    const interval = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
    const onFocus = () => void checkForUpdate();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkForUpdate]);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-[80] mx-auto flex max-w-xl items-center justify-between gap-4 rounded-xl border bg-card p-4 text-sm text-card-foreground shadow-lg"
    >
      <span>A new version is deployed. Refresh to load the latest update.</span>
      <Button size="sm" onClick={() => window.location.reload()}>
        Refresh
      </Button>
    </div>
  );
}
