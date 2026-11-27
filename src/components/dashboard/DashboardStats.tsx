import { useEffect, useState } from "react";

import { StatCard } from "@/components/shared/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthorization } from "@/lib/authorization";
import { fetchCampaignStats } from "@/lib/campaigns-api";
import { fetchContactStats } from "@/lib/recipients-api";
import { fetchQueueOverview } from "@/lib/queue-api";

type Metric = { label: string; value: string; hint: string };

export function DashboardStats() {
  const { features, can, loaded } = useAuthorization();
  const canReadQueue = can("queue.read");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setLoading(true);
    const requests: Promise<Metric>[] = [];
    if (features.campaigns) {
      requests.push(fetchCampaignStats().then(({ stats }) => ({
        label: "Campaigns", value: String(stats.total), hint: `${stats.draft} drafts · ${stats.ready} ready`,
      })).catch(() => ({ label: "Campaigns", value: "—", hint: "Could not load campaign totals" })));
    }
    if (features.recipients) {
      requests.push(fetchContactStats("all").then(({ stats }) => ({
        label: "Subscribed recipients", value: String(stats.subscribed), hint: `${stats.total} recipients in total`,
      })).catch(() => ({ label: "Subscribed recipients", value: "—", hint: "Could not load recipient totals" })));
    }
    if (canReadQueue) {
      requests.push(fetchQueueOverview().then(({ stats, simulationOnly }) => ({
        label: simulationOnly ? "Simulation jobs" : "Delivery jobs",
        value: String(stats.total ?? 0),
        hint: `${stats.pending ?? 0} waiting · ${stats.processing ?? 0} processing`,
      })).catch(() => ({ label: "Queue jobs", value: "—", hint: "Queue status is unavailable" })));
    }

    Promise.all(requests).then((result) => {
      if (!cancelled) setMetrics(result);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [features.campaigns, features.recipients, canReadQueue, loaded]);

  if (!loaded || loading) {
    return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading dashboard totals">
      {[0, 1, 2].map((item) => <Skeleton key={item} className="h-28 rounded-xl" />)}
    </div>;
  }

  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {metrics.map((metric) => <StatCard key={metric.label} {...metric} />)}
  </div>;
}
