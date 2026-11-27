import { Mail, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { CampaignStats } from "@/components/campaigns/CampaignStats";
import { CampaignsTable } from "@/components/campaigns/CampaignsTable";
import { PageMeta } from "@/components/layout/PageMeta";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthorization } from "@/lib/authorization";
import {
  CampaignApiError,
  cancelCampaign,
  deleteCampaign,
  duplicateCampaign,
  fetchCampaignStats,
  fetchCampaigns,
  type Campaign,
  type CampaignStatus,
} from "@/lib/campaigns-api";

export function CampaignsPage() {
  const { can } = useAuthorization();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof fetchCampaignStats>>["stats"] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CampaignStatus | "">("");
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Campaign | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  const fetchData = useCallback(() => {
    return Promise.all([
      fetchCampaignStats(),
      fetchCampaigns({
        page,
        limit: 25,
        q: q.trim() || undefined,
        status: status || undefined,
      }),
    ]).then(([statsRes, listRes]) => {
      setStats(statsRes.stats);
      setCampaigns(listRes.campaigns);
      setTotalPages(listRes.pagination.totalPages);
      setError(null);
    });
  }, [page, q, status]);

  useEffect(() => {
    let cancelled = false;
    fetchData()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof CampaignApiError ? err.message : "Failed to load campaigns");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchData, fetchKey]);

  const reload = useCallback(() => {
    setFetchKey((key) => key + 1);
    setLoading(true);
    fetchData()
      .catch((err) => {
        setError(err instanceof CampaignApiError ? err.message : "Failed to load campaigns");
      })
      .finally(() => setLoading(false));
  }, [fetchData]);

  const handleDuplicate = async (campaign: Campaign) => {
    try {
      const { campaign: copy } = await duplicateCampaign(campaign.id);
      window.location.href = `/app/campaigns/${copy.id}/edit/`;
    } catch (err) {
      setError(err instanceof CampaignApiError ? err.message : "Could not duplicate campaign");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setActionBusy(true);
    try {
      await deleteCampaign(pendingDelete.id);
      setPendingDelete(null);
      reload();
    } catch (err) {
      setError(err instanceof CampaignApiError ? err.message : "Could not delete campaign");
    } finally {
      setActionBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!pendingCancel) return;
    setActionBusy(true);
    try {
      await cancelCampaign(pendingCancel.id);
      setPendingCancel(null);
      reload();
    } catch (err) {
      setError(err instanceof CampaignApiError ? err.message : "Could not cancel campaign");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Campaigns | Binaries.nl"
        description="Create, organize, and prepare email campaigns."
        canonicalPath="/app/campaigns/"
      />
      <AppPageContainer>
        <PageHeader
          title="Campaigns"
          description="Create, organize, and prepare email campaigns."
          actions={can("campaigns.create") ? (
            <Button asChild>
              <Link to="/app/campaigns/new/">
                <Plus />
                Create campaign
              </Link>
            </Button>
          ) : null}
        />

        {stats && <CampaignStats stats={stats} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search campaigns"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="sm:max-w-xs"
          />
          <select
            className="native-select sm:w-56"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as CampaignStatus | "");
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="scheduled">Scheduled</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {q || status ? (
            <Button variant="ghost" onClick={() => { setQ(""); setStatus(""); setPage(1); }}>
              <X /> Clear filters
            </Button>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={q || status ? "No matching campaigns" : "No campaigns yet"}
            description={q || status ? "Try another search or clear the status filter." : "Campaigns combine a message with recipient targeting and eligibility checks."}
            action={!q && !status && can("campaigns.create") ? (
              <Button asChild>
                <Link to="/app/campaigns/new/">Create campaign</Link>
              </Button>
            ) : undefined}
          />
        ) : (
          <>
            <CampaignsTable
              campaigns={campaigns}
              onDuplicate={handleDuplicate}
              onCancel={setPendingCancel}
              onDelete={setPendingDelete}
            />
            {totalPages > 1 && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </AppPageContainer>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the campaign record only. Drafts, contacts, and lists are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={actionBusy} onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingCancel)} onOpenChange={(open) => !open && setPendingCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              The campaign will be marked cancelled. No sending infrastructure is active in this phase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>Keep</AlertDialogCancel>
            <AlertDialogAction disabled={actionBusy} onClick={confirmCancel}>
              Cancel campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
