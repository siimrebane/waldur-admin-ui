import React, { useState } from "react";
import api from "../api/client";

interface Quota {
  name: string;
  limit: number;
  usage: number;
}

interface Props {
  uuid: string;
  name: string;
  state: string;
  service_name: string;
  quotas?: Quota[];
  onChanged: () => void;
}

const STATE_COLORS: Record<string, { bg: string; text: string }> = {
  OK:                    { bg: "#d1fae5", text: "#065f46" },
  CREATING:              { bg: "#fef3c7", text: "#92400e" },
  CREATION_SCHEDULED:    { bg: "#fef3c7", text: "#92400e" },
  UPDATING:              { bg: "#e0f2fe", text: "#075985" },
  UPDATE_SCHEDULED:      { bg: "#e0f2fe", text: "#075985" },
  DELETING:              { bg: "#fee2e2", text: "#991b1b" },
  DELETION_SCHEDULED:    { bg: "#fee2e2", text: "#991b1b" },
  ERRED:                 { bg: "#fee2e2", text: "#991b1b" },
};

const QUOTA_META: Record<string, { label: string; unit: string; color: string; displayUnit: string }> = {
  vcpu:    { label: "CPU",     unit: "cores", color: "#4f8ef7", displayUnit: "cores" },
  cores:   { label: "CPU",     unit: "cores", color: "#4f8ef7", displayUnit: "cores" },
  ram:     { label: "RAM",     unit: "GB",    color: "#8b5cf6", displayUnit: "GB" },
  storage: { label: "Storage", unit: "GB",    color: "#10b981", displayUnit: "GB" },
};

function UsageBar({ quota }: { quota: Quota }) {
  const meta = QUOTA_META[quota.name];
  if (!meta || quota.limit <= 0) return null;
  const pct = Math.min(100, (quota.usage / quota.limit) * 100);
  const barColor = pct >= 60 ? "#10b981" : pct >= 30 ? "#f59e0b" : "#ef4444";
  // Quotas are stored in MB/MiB internally; display as GB for ram/storage
  const needsConvert = quota.name === "ram" || quota.name === "storage";
  const usage = needsConvert ? (quota.usage / 1024).toFixed(1) : quota.usage;
  const limit = needsConvert ? (quota.limit / 1024).toFixed(0) : quota.limit;
  const unit = `${usage} / ${limit} ${meta.unit}`;

  return (
    <div style={styles.quotaRow}>
      <div style={styles.quotaTop}>
        <span style={styles.quotaLabel}>{meta.label}</span>
        <span style={{ ...styles.quotaValue, color: pct < 30 ? "#ef4444" : "#555" }}>
          {unit} <span style={styles.quotaPct}>({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div style={styles.track}>
        <div style={{ ...styles.fill, width: `${pct}%`, background: barColor }} />
      </div>
    </div>
  );
}

export default function TenantCard({ uuid, name, state, service_name, quotas = [], onChanged }: Props) {
  const color = STATE_COLORS[state] ?? { bg: "#f3f4f6", text: "#374151" };
  const visibleQuotas = quotas.filter((q) => QUOTA_META[q.name] && q.limit > 0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editLimits, setEditLimits] = useState<Record<string, number>>({});

  const startEdit = () => {
    const current: Record<string, number> = {};
    quotas.forEach((q) => {
      if (QUOTA_META[q.name]) {
        // Convert MB→GB for display in edit form
        current[q.name] = (q.name === "ram" || q.name === "storage")
          ? Math.round(q.limit / 1024) : q.limit;
      }
    });
    setEditLimits(current);
    setEditing(true);
    setError(null);
  };

  const saveLimits = async () => {
    setSaving(true);
    setError(null);
    try {
      // Normalize: Waldur expects "cores", not "vcpu"
      const normalized = { ...editLimits };
      if (normalized.vcpu !== undefined) {
        normalized.cores = normalized.vcpu;
        delete normalized.vcpu;
      }
      await api.patch(`/tenants/${uuid}/limits`, { limits: normalized });
      setEditing(false);
      onChanged();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to update limits");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete tenant "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/tenants/${uuid}`);
      onChanged();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to delete tenant");
      setDeleting(false);
    }
  };

  const isOk = state === "OK";

  return (
    <div style={styles.card}>
      <div style={styles.top}>
        <span style={styles.icon}>🏗</span>
        <div style={styles.info}>
          <div style={styles.name}>{name}</div>
          {service_name && <div style={styles.service}>{service_name}</div>}
        </div>
        <span style={{ ...styles.badge, background: color.bg, color: color.text }}>
          {state}
        </span>
      </div>

      {visibleQuotas.length > 0 && !editing && (
        <div style={styles.quotas}>
          <div style={styles.quotasHeader}>
            <span style={styles.quotasTitle}>Resource utilization</span>
            <span
              style={styles.infoIcon}
              title="Billing is based on allocated quota, not actual usage. Higher utilization means better value for money — low % means you are paying for idle resources."
            >
              ⓘ
            </span>
          </div>
          {visibleQuotas.map((q) => <UsageBar key={q.name} quota={q} />)}
        </div>
      )}

      {editing && (
        <div style={styles.editSection}>
          <div style={styles.quotasTitle}>Edit resource limits</div>
          {Object.entries(editLimits).map(([key, val]) => {
            const meta = QUOTA_META[key];
            if (!meta) return null;
            return (
              <div key={key} style={styles.editRow}>
                <label style={styles.editLabel}>{meta.label} ({meta.displayUnit})</label>
                <input
                  type="number"
                  min={0}
                  value={val}
                  onChange={(e) => setEditLimits((prev) => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                  style={styles.editInput}
                />
              </div>
            );
          })}
          <div style={styles.editActions}>
            <button onClick={() => setEditing(false)} style={styles.cancelBtn}>Cancel</button>
            <button onClick={saveLimits} disabled={saving} style={styles.saveBtn}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {isOk && !editing && (
        <div style={styles.actions}>
          <button onClick={startEdit} style={styles.actionBtn}>Edit limits</button>
          <button onClick={handleDelete} disabled={deleting} style={styles.deleteBtn}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "#fff", border: "1px solid #e9ecef", borderRadius: 8,
    padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
  },
  top: { display: "flex", alignItems: "center", gap: 12 },
  icon: { fontSize: 20, flexShrink: 0 },
  info: { flex: 1 },
  name: { fontWeight: 600, fontSize: 14 },
  service: { fontSize: 12, color: "#888", marginTop: 2 },
  badge: {
    borderRadius: 12, padding: "2px 10px", fontSize: 11,
    fontWeight: 600, whiteSpace: "nowrap" as const, flexShrink: 0,
  },
  quotas: { display: "flex", flexDirection: "column", gap: 8, paddingTop: 6, borderTop: "1px solid #f3f4f6" },
  quotasHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  quotasTitle: { fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" },
  infoIcon: { fontSize: 13, color: "#9ca3af", cursor: "default" },
  quotaRow: { display: "flex", flexDirection: "column", gap: 3 },
  quotaTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  quotaLabel: { fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" },
  quotaValue: { fontSize: 11, color: "#555" },
  quotaPct: { color: "#9ca3af" },
  track: { height: 5, background: "#e9ecef", borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3, transition: "width 0.3s ease" },
  actions: { display: "flex", gap: 8, borderTop: "1px solid #f3f4f6", paddingTop: 8 },
  actionBtn: {
    flex: 1, padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 4,
    background: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", color: "#374151",
  },
  deleteBtn: {
    padding: "6px 12px", border: "none", borderRadius: 4,
    background: "#fee2e2", fontSize: 12, fontWeight: 500, cursor: "pointer", color: "#dc2626",
  },
  editSection: {
    display: "flex", flexDirection: "column", gap: 8,
    padding: 10, background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
  },
  editRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  editLabel: { fontSize: 12, fontWeight: 500, color: "#374151" },
  editInput: {
    width: 80, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4,
    fontSize: 13, textAlign: "right" as const,
  },
  editActions: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 },
  cancelBtn: {
    padding: "5px 12px", border: "1px solid #d1d5db", borderRadius: 4,
    background: "#fff", fontSize: 12, cursor: "pointer",
  },
  saveBtn: {
    padding: "5px 12px", border: "none", borderRadius: 4,
    background: "#4f8ef7", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  error: {
    background: "#fef2f2", color: "#dc2626", padding: "6px 10px",
    borderRadius: 4, fontSize: 11,
  },
};
