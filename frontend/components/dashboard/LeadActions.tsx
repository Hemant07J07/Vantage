"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import type { AssignmentUser } from "@/lib/types";

export function LeadActions({
  leadId,
  team,
  currentAssigneeId,
}: {
  leadId: number;
  team: AssignmentUser[];
  currentAssigneeId?: number;
}) {
  const router = useRouter();
  const [requalifying, setRequalifying] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(currentAssigneeId ? String(currentAssigneeId) : "");

  async function requalify() {
    setRequalifying(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/requalify`, { method: "POST" });
      // Checked rather than assumed: these used to fail silently, leaving the
      // user to guess whether the click did anything.
      if (!res.ok) throw new Error("Could not queue re-qualification.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRequalifying(false);
    }
  }

  async function assign(userId: string) {
    setSelected(userId);
    if (!userId) return;
    setAssigning(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: Number(userId) }),
      });
      if (!res.ok) throw new Error("Could not assign this lead.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(event) => assign(event.target.value)}
          disabled={assigning}
          aria-label="Assign to"
          className="h-9 px-2.5 rounded-lg bg-sunken border border-line text-sm text-body outline-none focus:border-accent disabled:opacity-50"
        >
          <option value="">Unassigned</option>
          {team.map((user) => (
            <option key={user.id} value={user.id}>
              {user.username}
            </option>
          ))}
        </select>

        <Button onClick={requalify} loading={requalifying}>
          {!requalifying && <RefreshCw className="w-3.5 h-3.5" />}
          Re-qualify
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
