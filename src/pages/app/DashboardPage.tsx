import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { QueueActivity } from "@/components/dashboard/QueueActivity";
import { RecentCampaigns } from "@/components/dashboard/RecentCampaigns";
import { PageMeta } from "@/components/layout/PageMeta";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuthorization } from "@/lib/authorization";

export function DashboardPage() {
  const { can } = useAuthorization();
  return (
    <>
      <PageMeta
        title="Dashboard | Binaries.nl"
        description="Binaries.nl dashboard overview."
        canonicalPath="/app/"
      />
      <AppPageContainer>
        <PageHeader
          title="Dashboard"
          description="A quick overview of your campaigns, recipients, and queue activity."
        />
        <DashboardStats />
        <QuickActions />
        <div className="grid gap-6 lg:grid-cols-2">
          <RecentCampaigns />
          {can("queue.read") ? <QueueActivity /> : null}
        </div>
      </AppPageContainer>
    </>
  );
}
