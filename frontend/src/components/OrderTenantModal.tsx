import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";

interface Component {
  type: string;
  name: string;
  measured_unit: string;
  price: number;
}

interface Plan {
  uuid: string;
  url: string;
  name: string;
  components: Component[];
}

interface Offering {
  uuid: string;
  url: string;
  name: string;
  customer_name: string;
  plans: Plan[];
}

interface Props {
  projectUuid: string;
  projectName: string;
  existingTenantNames: string[];
  onClose: (ordered?: boolean) => void;
}

function nextTenantName(projectName: string, existing: string[]): string {
  const base = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  for (let i = 1; ; i++) {
    const candidate = `${base}-tenant-${i}`;
    if (!existing.includes(candidate)) return candidate;
  }
}

export default function OrderTenantModal({ projectUuid, projectName, existingTenantNames, onClose }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(() => nextTenantName(projectName, existingTenantNames));
  const [offeringUrl, setOfferingUrl] = useState("");
  const [planUrl, setPlanUrl] = useState("");
  const [subnetCidr, setSubnetCidr] = useState("192.168.42.0/24");
  const [limits, setLimits] = useState<Record<string, number>>({});

  const { data: offerings = [], isLoading: loadingOfferings } = useQuery<Offering[]>({
    queryKey: ["tenant-offerings", projectUuid],
    queryFn: () => api.get(`/projects/${projectUuid}/tenant-offerings`).then((r) => r.data),
  });

  const selectedOffering = offerings.find((o) => o.url === offeringUrl);
  const selectedPlan = selectedOffering?.plans.find((p) => p.url === planUrl);

  // When plan changes, reset limits to defaults (10 per component)
  useEffect(() => {
    if (selectedPlan) {
      const defaults: Record<string, number> = {};
      selectedPlan.components.forEach((c) => { defaults[c.type] = 10; });
      setLimits(defaults);
    } else {
      setLimits({});
    }
  }, [planUrl]);

  // Auto-select plan if offering has only one
  useEffect(() => {
    if (selectedOffering?.plans.length === 1) {
      setPlanUrl(selectedOffering.plans[0].url);
    }
  }, [offeringUrl]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectUuid}/tenants`, {
        name,
        offering_url: offeringUrl,
        plan_url: planUrl || undefined,
        subnet_cidr: subnetCidr || undefined,
        limits: Object.keys(limits).length > 0 ? limits : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants", projectUuid] });
      onClose(true);
    },
  });

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Order Tenant</h2>
        <p style={styles.subtitle}>
          A tenant is your private OpenStack network environment. VMs live inside it.
        </p>

        <label style={styles.label}>
          Tenant name
          <input
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. my-project-tenant"
            autoFocus
          />
        </label>

        <label style={styles.label}>
          Offering
          {loadingOfferings ? (
            <div style={styles.muted}>Loading offerings…</div>
          ) : offerings.length === 0 ? (
            <div style={styles.errorText}>No active OpenStack tenant offerings found.</div>
          ) : (
            <select
              style={styles.input}
              value={offeringUrl}
              onChange={(e) => { setOfferingUrl(e.target.value); setPlanUrl(""); }}
            >
              <option value="">— select an offering —</option>
              {offerings.map((o) => (
                <option key={o.uuid} value={o.url}>
                  {o.name}{o.customer_name ? ` (${o.customer_name})` : ""}
                </option>
              ))}
            </select>
          )}
        </label>

        {selectedOffering && selectedOffering.plans.length > 1 && (
          <label style={styles.label}>
            Plan
            <select style={styles.input} value={planUrl} onChange={(e) => setPlanUrl(e.target.value)}>
              <option value="">— select a plan —</option>
              {selectedOffering.plans.map((p) => (
                <option key={p.uuid} value={p.url}>{p.name}</option>
              ))}
            </select>
          </label>
        )}

        <label style={styles.label}>
          Subnet CIDR
          <input
            style={styles.input}
            value={subnetCidr}
            onChange={(e) => setSubnetCidr(e.target.value)}
            placeholder="192.168.42.0/24"
          />
        </label>

        {/* Dynamic quota fields from plan components */}
        {selectedPlan && selectedPlan.components.length > 0 && (() => {
          const monthlyTotal = selectedPlan.components.reduce((sum, c) => {
            const qty = limits[c.type] ?? 10;
            return sum + qty * c.price;
          }, 0);
          const hasPrice = selectedPlan.components.some((c) => c.price > 0);
          return (
            <div>
              <div style={styles.quotaTitle}>Resource limits</div>
              <div style={styles.quotaGrid}>
                {selectedPlan.components.map((c) => {
                  const qty = limits[c.type] ?? 10;
                  const lineTotal = qty * c.price;
                  return (
                    <label key={c.type} style={styles.quotaLabel}>
                      <span style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{c.name} ({c.measured_unit})</span>
                        {c.price > 0 && (
                          <span style={styles.linePrice}>€{lineTotal.toFixed(2)}/mo</span>
                        )}
                      </span>
                      <input
                        style={styles.quotaInput}
                        type="number"
                        min={1}
                        value={qty}
                        onChange={(e) =>
                          setLimits((prev) => ({ ...prev, [c.type]: parseInt(e.target.value) || 0 }))
                        }
                      />
                    </label>
                  );
                })}
              </div>
              {hasPrice && (
                <div style={styles.costEstimate}>
                  <span style={styles.costLabel}>Estimated monthly cost</span>
                  <span style={styles.costValue}>€{monthlyTotal.toFixed(2)}</span>
                </div>
              )}
            </div>
          );
        })()}

        {mutation.isError && (
          <p style={styles.errorText}>
            Failed to submit order.{" "}
            {(mutation.error as any)?.response?.data?.detail || ""}
          </p>
        )}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={styles.submitBtn}
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || !offeringUrl || mutation.isPending}
          >
            {mutation.isPending ? "Ordering…" : "Order Tenant"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modal: {
    background: "#fff", borderRadius: 8, padding: 28, width: 460,
    display: "flex", flexDirection: "column", gap: 14,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    maxHeight: "90vh", overflowY: "auto",
  },
  title: { fontSize: 18, fontWeight: 700 },
  subtitle: { fontSize: 13, color: "#666", marginTop: -6 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 },
  input: {
    padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6,
    fontSize: 14, outline: "none", fontFamily: "inherit",
  },
  muted: { fontSize: 13, color: "#888", padding: "6px 0" },
  errorText: { color: "#dc2626", fontSize: 13 },
  quotaTitle: { fontSize: 13, fontWeight: 600, marginBottom: 8 },
  quotaGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px",
    padding: 14, background: "#f9fafb",
    borderRadius: 6, border: "1px solid #e9ecef",
  },
  quotaLabel: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 500, cursor: "default" },
  linePrice: { fontSize: 11, fontWeight: 600, color: "#4f8ef7" },
  costEstimate: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginTop: 10, padding: "10px 14px", background: "#eff6ff",
    borderRadius: 6, border: "1px solid #bfdbfe",
  },
  costLabel: { fontSize: 13, fontWeight: 500, color: "#1e40af" },
  costValue: { fontSize: 18, fontWeight: 700, color: "#1d4ed8" },
  quotaInput: {
    padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
    fontSize: 13, outline: "none", fontFamily: "inherit",
  },
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  cancelBtn: {
    padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: 6,
    background: "#fff", fontSize: 14,
  },
  submitBtn: {
    padding: "8px 20px", border: "none", borderRadius: 6,
    background: "#4f8ef7", color: "#fff", fontSize: 14, fontWeight: 600,
  },
};
