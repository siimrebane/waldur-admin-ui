import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import api from "../api/client";
import type { ProjectCosts, CostResource } from "../types/api";

const EURO = (n: number) => `€${n.toFixed(2)}`;

const COMPONENT_COLORS: Record<string, string> = {
  CPU: "#4f8ef7",
  Cores: "#4f8ef7",
  RAM: "#7c3aed",
  Storage: "#059669",
};
const componentColor = (name: string) =>
  COMPONENT_COLORS[name] || "#6b7280";

interface Props { projectUuid: string; }

export default function ProjectCosts({ projectUuid }: Props) {
  const [expandedResource, setExpandedResource] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<ProjectCosts>({
    queryKey: ["costs", projectUuid],
    queryFn: () => api.get(`/projects/${projectUuid}/costs`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div style={styles.loading}>Loading cost data…</div>;
  if (isError || !data) return <div style={styles.error}>Cost data unavailable.</div>;

  const { months, current } = data;
  const prevMonth = months.length >= 2 ? months[months.length - 2] : null;
  const pctChange = prevMonth && prevMonth.price > 0
    ? ((( current?.price ?? 0) - prevMonth.price) / prevMonth.price) * 100
    : null;

  const maxPrice = Math.max(...months.map((m) => m.price), 0.01);

  return (
    <div style={styles.wrapper}>

      {/* Top stats row */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>This month</div>
          <div style={styles.statValue}>{EURO(current?.price ?? 0)}</div>
          {pctChange !== null && (
            <div style={{ ...styles.statBadge, background: pctChange > 0 ? "#fee2e2" : "#d1fae5", color: pctChange > 0 ? "#dc2626" : "#065f46" }}>
              {pctChange > 0 ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}% vs last month
            </div>
          )}
        </div>

        {prevMonth && (
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Last month</div>
            <div style={{ ...styles.statValue, fontSize: 22 }}>{EURO(prevMonth.price)}</div>
          </div>
        )}

        {months.length >= 3 && (
          <div style={styles.statCard}>
            <div style={styles.statLabel}>3-month avg</div>
            <div style={{ ...styles.statValue, fontSize: 22 }}>
              {EURO(months.slice(-3).reduce((s, m) => s + m.price, 0) / 3)}
            </div>
          </div>
        )}

        {months.length > 0 && (
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Total tracked</div>
            <div style={{ ...styles.statValue, fontSize: 22 }}>
              {EURO(months.reduce((s, m) => s + m.price, 0))}
            </div>
          </div>
        )}
      </div>

      {/* Bar chart */}
      {months.length > 0 && (
        <div style={styles.chartCard}>
          <div style={styles.sectionTitle}>Monthly cost</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={months} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `€${v}`}
                width={52}
              />
              <Tooltip
                formatter={(value: number) => [EURO(value), "Cost"]}
                contentStyle={{ borderRadius: 6, border: "1px solid #e9ecef", fontSize: 13 }}
                cursor={{ fill: "rgba(79,142,247,0.07)" }}
              />
              <Bar dataKey="price" radius={[4, 4, 0, 0]}>
                {months.map((m, i) => (
                  <Cell
                    key={i}
                    fill={i === months.length - 1 ? "#4f8ef7" : "#c7d9f8"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Resource breakdown */}
      {current && current.resources.length > 0 && (
        <div style={styles.chartCard}>
          <div style={styles.sectionTitle}>
            Resource breakdown — {new Date(current.year, current.month - 1).toLocaleString("en", { month: "long", year: "numeric" })}
          </div>

          <div style={styles.resourceList}>
            {current.resources.map((r) => (
              <ResourceRow
                key={r.name}
                resource={r}
                maxTotal={current.resources[0].total}
                expanded={expandedResource === r.name}
                onToggle={() => setExpandedResource(expandedResource === r.name ? null : r.name)}
              />
            ))}
          </div>
        </div>
      )}

      {!current && <div style={styles.noData}>No billing data for the current period.</div>}
    </div>
  );
}

function ResourceRow({ resource, maxTotal, expanded, onToggle }: {
  resource: CostResource;
  maxTotal: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const barWidth = maxTotal > 0 ? (resource.total / maxTotal) * 100 : 0;

  return (
    <div style={styles.resourceItem}>
      <div style={styles.resourceHeader} onClick={onToggle}>
        <div style={styles.resourceLeft}>
          <span style={styles.toggleIcon}>{expanded ? "▾" : "▸"}</span>
          <span style={styles.resourceName}>{resource.name}</span>
        </div>
        <div style={styles.resourceRight}>
          <div style={styles.barTrack}>
            <div style={{ ...styles.barFill, width: `${barWidth}%` }} />
          </div>
          <span style={styles.resourceCost}>{`€${resource.total.toFixed(2)}`}</span>
        </div>
      </div>

      {expanded && (
        <div style={styles.componentList}>
          {resource.components.map((c, i) => (
            <div key={i} style={styles.componentRow}>
              <span style={{ ...styles.componentDot, background: componentColor(c.name) }} />
              <span style={styles.componentName}>{c.name}</span>
              <span style={styles.componentDetail}>
                {c.quantity} {c.measured_unit}
              </span>
              <span style={styles.componentCost}>{`€${c.price.toFixed(2)}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: "flex", flexDirection: "column", gap: 16 },
  loading: { padding: 20, color: "#888", fontSize: 13 },
  error: { padding: 20, color: "#dc2626", fontSize: 13 },
  noData: { padding: 20, color: "#888", fontSize: 13 },

  statsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 },
  statCard: {
    background: "#fff", border: "1px solid #e9ecef", borderRadius: 8,
    padding: "16px 20px", display: "flex", flexDirection: "column", gap: 6,
  },
  statLabel: { fontSize: 12, color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" },
  statValue: { fontSize: 28, fontWeight: 700, color: "#1a1a2e" },
  statBadge: {
    display: "inline-block", borderRadius: 12, padding: "2px 10px",
    fontSize: 12, fontWeight: 600, width: "fit-content",
  },

  chartCard: {
    background: "#fff", border: "1px solid #e9ecef", borderRadius: 8, padding: "20px 20px 16px",
  },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 16 },

  resourceList: { display: "flex", flexDirection: "column", gap: 2 },
  resourceItem: {
    borderRadius: 6, overflow: "hidden",
    border: "1px solid transparent",
  },
  resourceHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 12px", cursor: "pointer", borderRadius: 6,
    background: "#f9fafb",
    userSelect: "none",
  },
  resourceLeft: { display: "flex", alignItems: "center", gap: 8 },
  toggleIcon: { fontSize: 11, color: "#6b7280", width: 12 },
  resourceName: { fontWeight: 600, fontSize: 14 },
  resourceRight: { display: "flex", alignItems: "center", gap: 12 },
  barTrack: {
    width: 120, height: 6, background: "#e9ecef", borderRadius: 3, overflow: "hidden",
  },
  barFill: { height: "100%", background: "#4f8ef7", borderRadius: 3, transition: "width 0.3s" },
  resourceCost: { fontSize: 14, fontWeight: 700, color: "#1a1a2e", minWidth: 60, textAlign: "right" },

  componentList: {
    background: "#fff", borderTop: "1px solid #f0f0f0", padding: "8px 12px 10px 32px",
    display: "flex", flexDirection: "column", gap: 6,
  },
  componentRow: { display: "flex", alignItems: "center", gap: 8 },
  componentDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  componentName: { flex: 1, fontSize: 13, color: "#374151" },
  componentDetail: { fontSize: 12, color: "#9ca3af" },
  componentCost: { fontSize: 13, fontWeight: 600, color: "#374151", minWidth: 55, textAlign: "right" },
};
