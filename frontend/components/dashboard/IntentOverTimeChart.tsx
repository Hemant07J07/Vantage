"use client";

import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { MIN_TREND_DAYS } from "@/lib/constants";
import type { IntentOverTime } from "@/lib/types";

/**
 * Weekly intent trend.
 *
 * With a young dataset there is genuinely no trend to draw, so rather than
 * joining two points into a line that implies a direction, the single real
 * data point is stated plainly. Omitting it entirely would be its own kind of
 * dishonesty, so it's named rather than hidden.
 */
export function IntentOverTimeChart({ data }: { data: IntentOverTime }) {
  if (!data.has_enough_history) {
    const only = data.series[0];
    return (
      <EmptyState
        icon={TrendingUp}
        title="Not enough history yet"
        body={
          only
            ? `One data point so far: ${only.total} lead${only.total === 1 ? "" : "s"} scored, averaging ${only.avg_score}. The trend line appears after ${MIN_TREND_DAYS} days.`
            : `No scored leads yet. This chart fills in as leads are qualified.`
        }
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#5C6478", fontSize: 11, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#5C6478", fontSize: 11, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.12)" }}
          contentStyle={{
            background: "#15161F",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            fontSize: 12,
            color: "#C3C9D8",
          }}
        />
        <Line type="monotone" dataKey="total" stroke="#7C5CFF" strokeWidth={2} dot={false} name="Scored" />
        <Line type="monotone" dataKey="high_intent" stroke="#29D3EE" strokeWidth={2} dot={false} name="High intent" />
      </LineChart>
    </ResponsiveContainer>
  );
}
