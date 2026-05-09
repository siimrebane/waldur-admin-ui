import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";

interface Rule {
  id?: number;
  direction: string;
  protocol: string;
  from_port: number;
  to_port: number;
  cidr: string;
  ethertype: string;
  description: string;
}

interface SecurityGroup {
  uuid: string;
  name: string;
  description: string;
  state: string;
  rules: Rule[];
}

interface TenantInfo {
  uuid: string;
  name: string;
  state: string;
}

interface Props {
  projectUuid: string;
  tenants: TenantInfo[];
}

const PRESETS: { name: string; description: string; rules: Omit<Rule, "id" | "description">[] }[] = [
  {
    name: "ssh",
    description: "Allow SSH access",
    rules: [{ direction: "ingress", protocol: "tcp", from_port: 22, to_port: 22, cidr: "0.0.0.0/0", ethertype: "IPv4" }],
  },
  {
    name: "ping",
    description: "Allow ICMP ping",
    rules: [{ direction: "ingress", protocol: "icmp", from_port: -1, to_port: -1, cidr: "0.0.0.0/0", ethertype: "IPv4" }],
  },
  {
    name: "web",
    description: "Allow HTTP and HTTPS",
    rules: [
      { direction: "ingress", protocol: "tcp", from_port: 80, to_port: 80, cidr: "0.0.0.0/0", ethertype: "IPv4" },
      { direction: "ingress", protocol: "tcp", from_port: 443, to_port: 443, cidr: "0.0.0.0/0", ethertype: "IPv4" },
    ],
  },
];

type Mode = "closed" | "pick";

export default function SecurityGroups({ projectUuid, tenants }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("closed");
  const [customMode, setCustomMode] = useState(false);
  const [target, setTarget] = useState<string>("all");
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<string>("");

  // Custom group fields
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRules, setNewRules] = useState<Rule[]>([]);

  const queryClient = useQueryClient();
  const okTenants = tenants.filter((t) => t.state === "OK");
  const viewTenant = selectedTenant || okTenants[0]?.uuid || "";

  const { data: groups = [], isLoading } = useQuery<SecurityGroup[]>({
    queryKey: ["security-groups", viewTenant],
    queryFn: () => api.get(`/tenants/${viewTenant}/security-groups`).then((r) => r.data),
    enabled: !!viewTenant,
  });

  if (okTenants.length === 0) {
    return (
      <div>
        <h2 style={styles.h2}>Security Groups</h2>
        <p style={styles.muted}>Create a tenant first to manage security groups.</p>
      </div>
    );
  }

  const createGroup = async (name: string, description: string, rules: any[]) => {
    setSyncing(true);
    setResult(null);
    try {
      if (target === "all") {
        const { data } = await api.post(`/projects/${projectUuid}/security-groups`, {
          name, description, rules,
        });
        const summary = data.results
          .map((r: any) => r.skipped ? `${r.tenant}: exists` : r.error ? `${r.tenant}: FAILED` : `${r.tenant}: created`)
          .join(" | ");
        setResult(summary);
      } else {
        await api.post(`/tenants/${target}/security-groups`, { name, description, rules });
        const tenantName = okTenants.find((t) => t.uuid === target)?.name || target;
        setResult(`${tenantName}: created`);
      }
      queryClient.invalidateQueries({ queryKey: ["security-groups"] });
      setMode("closed");
      setCustomMode(false);
      setNewName("");
      setNewDesc("");
      setNewRules([]);
    } catch (e: any) {
      setResult(`Error: ${e.response?.data?.detail || "failed"}`);
    } finally {
      setSyncing(false);
    }
  };

  const addRule = () => {
    setNewRules([...newRules, {
      direction: "ingress", protocol: "tcp", from_port: 0, to_port: 0,
      cidr: "0.0.0.0/0", ethertype: "IPv4", description: "",
    }]);
  };

  const updateRule = (idx: number, field: string, value: any) => {
    const updated = [...newRules];
    (updated[idx] as any)[field] = value;
    setNewRules(updated);
  };

  const removeRule = (idx: number) => setNewRules(newRules.filter((_, i) => i !== idx));

  const formatRule = (r: Rule) => {
    if (r.protocol === "icmp") return `ICMP from ${r.cidr}`;
    const ports = r.from_port === r.to_port ? `${r.from_port}` : `${r.from_port}-${r.to_port}`;
    return `${r.protocol?.toUpperCase() || "ANY"} ${ports} from ${r.cidr}`;
  };

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.h2}>Security Groups</h2>
        <button style={styles.btn} onClick={() => { setMode(mode === "closed" ? "pick" : "closed"); setCustomMode(false); }}>
          {mode === "closed" ? "+ Add Security Group" : "Cancel"}
        </button>
      </div>

      {result && (
        <div style={{
          ...styles.resultBox,
          background: result.includes("FAILED") || result.startsWith("Error") ? "#fef2f2" : "#f0fdf4",
          color: result.includes("FAILED") || result.startsWith("Error") ? "#dc2626" : "#166534",
        }}>
          {result}
        </div>
      )}

      {mode === "pick" && (
        <div style={styles.panel}>
          {/* Target selector */}
          <div style={{ marginBottom: 14 }}>
            <label style={styles.fieldLabel}>Apply to</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={styles.select}>
              <option value="all">All {okTenants.length} tenant{okTenants.length !== 1 ? "s" : ""}</option>
              {okTenants.map((t) => (
                <option key={t.uuid} value={t.uuid}>{t.name}</option>
              ))}
            </select>
          </div>

          {!customMode ? (
            <>
              {/* Preset buttons */}
              <label style={styles.fieldLabel}>Quick add</label>
              <div style={styles.presetGrid}>
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    style={styles.presetBtn}
                    onClick={() => createGroup(p.name, p.description, p.rules)}
                    disabled={syncing}
                  >
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: "#666" }}>{p.description}</span>
                  </button>
                ))}
              </div>

              <div style={styles.orDivider}>
                <span style={styles.orText}>or</span>
              </div>

              <button
                style={{ ...styles.btn, background: "#6b7280", width: "100%" }}
                onClick={() => { setCustomMode(true); addRule(); }}
              >
                Create custom group
              </button>
            </>
          ) : (
            <>
              {/* Custom group form */}
              <label style={styles.fieldLabel}>Group name</label>
              <input
                placeholder="e.g. app-ports"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={styles.input}
                autoFocus
              />
              <label style={{ ...styles.fieldLabel, marginTop: 8 }}>Description (optional)</label>
              <input
                placeholder=""
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                style={styles.input}
              />

              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={styles.fieldLabel}>Inbound Rules</label>
                  <button onClick={addRule} style={styles.smallBtn}>+ Rule</button>
                </div>
                {newRules.map((r, i) => (
                  <div key={i} style={styles.ruleRow}>
                    <select value={r.protocol} onChange={(e) => updateRule(i, "protocol", e.target.value)} style={styles.ruleInput}>
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                      <option value="icmp">ICMP</option>
                    </select>
                    {r.protocol !== "icmp" && (
                      <>
                        <input
                          type="number" placeholder="From" value={r.from_port || ""}
                          onChange={(e) => updateRule(i, "from_port", parseInt(e.target.value) || 0)}
                          style={{ ...styles.ruleInput, width: 75 }}
                        />
                        <span style={{ color: "#888" }}>-</span>
                        <input
                          type="number" placeholder="To" value={r.to_port || ""}
                          onChange={(e) => updateRule(i, "to_port", parseInt(e.target.value) || 0)}
                          style={{ ...styles.ruleInput, width: 75 }}
                        />
                      </>
                    )}
                    <input
                      placeholder="0.0.0.0/0" value={r.cidr}
                      onChange={(e) => updateRule(i, "cidr", e.target.value)}
                      style={{ ...styles.ruleInput, width: 120 }}
                    />
                    <button onClick={() => removeRule(i)} style={styles.removeBtn}>x</button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => createGroup(newName, newDesc, newRules)}
                disabled={!newName || newRules.length === 0 || syncing}
                style={{ ...styles.btn, marginTop: 12, width: "100%" }}
              >
                {syncing ? "Creating..." : target === "all" ? `Create in all ${okTenants.length} tenant(s)` : "Create"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Tenant selector for viewing */}
      {okTenants.length > 1 && (
        <div style={{ marginBottom: 8, marginTop: mode === "closed" ? 8 : 0 }}>
          <label style={{ fontSize: 12, color: "#666", marginRight: 8 }}>Viewing:</label>
          <select value={viewTenant} onChange={(e) => setSelectedTenant(e.target.value)} style={styles.select}>
            {okTenants.map((t) => (
              <option key={t.uuid} value={t.uuid}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* List */}
      {isLoading && <div style={styles.state}>Loading...</div>}
      {!isLoading && groups.length === 0 && (
        <p style={styles.muted}>No security groups in this tenant.</p>
      )}
      {!isLoading && groups.length > 0 && (
        <div style={styles.list}>
          {groups.map((sg) => (
            <div key={sg.uuid} style={styles.sgCard}>
              <div style={styles.sgHeader} onClick={() => setExpanded(expanded === sg.uuid ? null : sg.uuid)}>
                <span style={{ fontWeight: 600 }}>
                  {sg.name}
                  <span style={{ fontWeight: 400, fontSize: 11, color: "#888", marginLeft: 8 }}>
                    in {okTenants.find((t) => t.uuid === viewTenant)?.name || "unknown"}
                  </span>
                </span>
                <span style={{ fontSize: 12, color: "#888" }}>
                  {sg.rules.filter((r) => r.direction === "ingress").length} rule(s) {expanded === sg.uuid ? "▲" : "▼"}
                </span>
              </div>
              {expanded === sg.uuid && (
                <div style={styles.sgRules}>
                  {sg.description && <p style={{ fontSize: 12, color: "#666", margin: "0 0 6px" }}>{sg.description}</p>}
                  {sg.rules.filter((r) => r.direction === "ingress").length === 0 && (
                    <p style={{ fontSize: 12, color: "#888" }}>No inbound rules</p>
                  )}
                  {sg.rules.filter((r) => r.direction === "ingress").map((r, i) => (
                    <div key={i} style={styles.ruleDisplay}>{formatRule(r)}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  h2: { fontSize: 18, fontWeight: 700 },
  muted: { color: "#888", fontSize: 13 },
  btn: {
    padding: "8px 16px", border: "none", borderRadius: 6,
    background: "#4f8ef7", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  smallBtn: {
    padding: "4px 12px", border: "none", borderRadius: 4,
    background: "#4f8ef7", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  removeBtn: {
    padding: "4px 8px", border: "none", borderRadius: 4,
    background: "#dc2626", color: "#fff", fontSize: 12, cursor: "pointer",
  },
  resultBox: { padding: "8px 12px", borderRadius: 6, fontSize: 12, marginBottom: 10 },
  panel: {
    background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8,
    padding: 16, marginBottom: 12,
  },
  fieldLabel: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 },
  select: { padding: "6px 10px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 13, width: "100%" },
  input: {
    display: "block", width: "100%", padding: "8px 10px",
    border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13,
    boxSizing: "border-box" as const,
  },
  presetGrid: { display: "flex", gap: 8, marginBottom: 12 },
  presetBtn: {
    flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 2,
    padding: "12px 8px", border: "1px solid #d1d5db", borderRadius: 6,
    background: "#fff", cursor: "pointer", fontSize: 13,
  },
  orDivider: {
    display: "flex", alignItems: "center", margin: "4px 0 12px",
    borderTop: "1px solid #e5e7eb",
  },
  orText: {
    position: "relative" as const, top: -1, background: "#f9fafb",
    padding: "0 10px", margin: "0 auto", fontSize: 12, color: "#888",
  },
  ruleRow: { display: "flex", gap: 6, alignItems: "center", marginTop: 6 },
  ruleInput: { padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 },
  list: { display: "flex", flexDirection: "column", gap: 4 },
  sgCard: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" },
  sgHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 14px", cursor: "pointer",
  },
  sgRules: { padding: "0 14px 10px", borderTop: "1px solid #f0f0f0" },
  ruleDisplay: {
    fontSize: 12, fontFamily: "monospace", padding: "4px 8px",
    background: "#f3f4f6", borderRadius: 3, marginTop: 4,
  },
  state: { padding: 20, textAlign: "center", color: "#666" },
};
