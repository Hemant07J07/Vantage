import { ResearchLauncher } from "@/components/research/ResearchLauncher";
import { ResearchHistoryTable } from "@/components/dashboard/ResearchHistoryTable";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import { backendFetchSafe } from "@/lib/api";
import type { ResearchJob } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const history = await backendFetchSafe<{ results: ResearchJob[] }>(
    "/research/history/",
    { results: [] }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[32px] font-semibold tracking-tight text-hi">Research</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          Build an evidence-backed brief for any company.
        </p>
      </div>

      <ResearchLauncher />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <span className="text-xs text-faint">{history.results.length}</span>
        </CardHeader>

        <ResearchHistoryTable jobs={history.results} />
      </Card>
    </div>
  );
}
