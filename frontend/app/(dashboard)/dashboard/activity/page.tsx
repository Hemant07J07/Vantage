import { Card, CardBody } from "@/components/ui";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { backendFetchSafe } from "@/lib/api";
import type { ActivityRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const data = await backendFetchSafe<{ results: ActivityRow[] }>(
    "/analytics/activity/?limit=100",
    { results: [] }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[32px] font-semibold tracking-tight text-hi">Activity</h1>
        <p className="mt-1.5 text-[15px] text-muted">Every state change, newest first</p>
      </div>
      <Card>
        <CardBody>
          <ActivityFeed rows={data.results} />
        </CardBody>
      </Card>
    </div>
  );
}
