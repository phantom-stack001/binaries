import { Mail, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { CampaignStatusBadge } from "@/components/campaigns/CampaignStatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthorization } from "@/lib/authorization";
import { fetchCampaigns, type Campaign } from "@/lib/campaigns-api";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "recently" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function RecentCampaigns() {
  const { features, can, loaded } = useAuthorization();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loaded || !features.campaigns || !can("campaigns.read")) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchCampaigns({ limit: 5 })
      .then(({ campaigns: rows }) => { if (!cancelled) setCampaigns(rows); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [features.campaigns, loaded]);

  if (loaded && (!features.campaigns || !can("campaigns.read"))) return null;

  return (
    <Card className="flex flex-1 flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>Recent campaigns</CardTitle>
          <CardDescription>Your latest campaign updates.</CardDescription>
        </div>
        {features.campaigns && can("campaigns.create") && (
          <Button asChild size="sm" variant="outline"><Link to="/app/campaigns/new/"><Plus /> Create</Link></Button>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? <div className="space-y-3" aria-label="Loading campaigns">
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-14 w-full" />)}
        </div> : failed ? (
          <EmptyState icon={Mail} title="Campaigns unavailable" description="We couldn’t load campaign activity. Refresh the page to try again." />
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No campaigns yet"
            description="Create a campaign to organize your message and recipients. Campaign delivery is currently simulation-only."
            action={features.campaigns && can("campaigns.create") ? <Button asChild variant="outline" size="sm"><Link to="/app/campaigns/new/"><Plus /> Create campaign</Link></Button> : undefined}
          />
        ) : (
          <div className="space-y-1">
            {campaigns.map((campaign) => (
              <Link key={campaign.id} to={`/app/campaigns/${campaign.id}/`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{campaign.name || "Untitled campaign"}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Updated {formatDate(campaign.updatedAt)}</span>
                </span>
                <CampaignStatusBadge status={campaign.status} />
              </Link>
            ))}
            <div className="pt-3">
              <Button asChild variant="ghost" size="sm"><Link to="/app/campaigns/">View all campaigns</Link></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
