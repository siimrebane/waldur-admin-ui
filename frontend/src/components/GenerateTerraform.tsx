import React, { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import api from "../api/client";

interface Tenant {
  uuid: string;
  name: string;
  state: string;
}

interface Flavor {
  name: string;
  cores: number;
  ram: number;
  disk: number;
}

interface Image {
  name: string;
  min_disk: number;
  min_ram: number;
}

interface SecurityGroup {
  uuid: string;
  url: string;
  name: string;
  description?: string;
}

interface Props {
  projectUuid: string;
  tenants: Tenant[];
}

export default function GenerateTerraform({ projectUuid, tenants }: Props) {
  const okTenants = tenants.filter((t) => t.state === "OK");

  const { data: flavors = [] } = useQuery<Flavor[]>({
    queryKey: ["flavors", projectUuid],
    queryFn: () => api.get(`/projects/${projectUuid}/flavors`).then((r) => r.data),
    enabled: okTenants.length > 0,
  });

  const { data: images = [] } = useQuery<Image[]>({
    queryKey: ["images", projectUuid],
    queryFn: () => api.get(`/projects/${projectUuid}/images`).then((r) => r.data),
    enabled: okTenants.length > 0,
  });

  const [selectedTenants, setSelectedTenants] = useState<Set<string>>(new Set());
  const [selectedSgNames, setSelectedSgNames] = useState<Set<string>>(new Set());
  const [vmCount, setVmCount] = useState(1);
  const [vmPrefix, setVmPrefix] = useState("vm");
  const [flavor, setFlavor] = useState("");
  const [image, setImage] = useState("");
  const [volumeSize, setVolumeSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Fetch security groups for every selected tenant in parallel.
  const sgQueries = useQueries({
    queries: Array.from(selectedTenants).map((tenantUuid) => ({
      queryKey: ["sg-for-tenant", tenantUuid],
      queryFn: () =>
        api.get(`/tenants/${tenantUuid}/security-groups`).then((r) => r.data as SecurityGroup[]),
      enabled: true,
      staleTime: 30_000,
    })),
  });

  // Deduplicate SG names across selected tenants — student picks by name,
  // backend resolves the per-tenant URL/UUID for each generated VM.
  const sgNamesAvailable: string[] = React.useMemo(() => {
    const set = new Set<string>();
    for (const q of sgQueries) {
      if (!q.data) continue;
      for (const sg of q.data) {
        if (sg.name && sg.name !== "default") set.add(sg.name);
      }
    }
    return Array.from(set).sort();
  }, [sgQueries.map((q) => q.dataUpdatedAt).join("|")]);

  // Default-select sensible groups (ssh, ping) when the available list first
  // populates. The student can change the selection afterwards.
  React.useEffect(() => {
    if (sgNamesAvailable.length > 0 && selectedSgNames.size === 0) {
      const sensible = new Set<string>();
      for (const name of ["ssh", "ping"]) {
        if (sgNamesAvailable.includes(name)) sensible.add(name);
      }
      if (sensible.size > 0) setSelectedSgNames(sensible);
    }
  }, [sgNamesAvailable]);

  const toggleSg = (name: string) => {
    setSelectedSgNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Auto-select first flavor/image when data loads
  React.useEffect(() => {
    if (flavors.length > 0 && !flavor) setFlavor(flavors[0].name);
  }, [flavors]);
  React.useEffect(() => {
    if (images.length > 0 && !image) setImage(images[0].name);
  }, [images]);

  const toggleTenant = (uuid: string) => {
    setSelectedTenants((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedTenants.size === okTenants.length) {
      setSelectedTenants(new Set());
    } else {
      setSelectedTenants(new Set(okTenants.map((t) => t.uuid)));
    }
  };

  const maxVms = selectedTenants.size * 10;
  const tenantsNeeded = Math.ceil(vmCount / 10);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const { data } = await api.get(`/projects/${projectUuid}/generate-terraform`, {
        params: {
          vm_count: vmCount,
          vm_prefix: vmPrefix,
          flavor,
          image,
          volume_size: volumeSize * 1024, // GB → MiB for terraform
          tenant_uuids: Array.from(selectedTenants).join(","),
          security_group_names: Array.from(selectedSgNames).join(","),
        },
      });
      setPreview(data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to generate Terraform configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!preview) return;
    const blob = new Blob([preview], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "main.tf";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    if (preview) navigator.clipboard.writeText(preview);
  };

  if (okTenants.length === 0) return null;

  const selectedFlavor = flavors.find((f) => f.name === flavor);

  return (
    <div>
      <h2 style={styles.h2}>Generate Terraform</h2>

      <div style={styles.form}>
        {/* Tenant selector */}
        <div style={styles.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={styles.label}>Select tenants</label>
            <button onClick={selectAll} style={styles.linkBtn}>
              {selectedTenants.size === okTenants.length ? "Deselect all" : "Select all"}
            </button>
          </div>
          <div style={styles.tenantList}>
            {okTenants.map((t) => (
              <label key={t.uuid} style={styles.tenantItem}>
                <input
                  type="checkbox"
                  checked={selectedTenants.has(t.uuid)}
                  onChange={() => toggleTenant(t.uuid)}
                />
                <span style={{ marginLeft: 6 }}>{t.name}</span>
              </label>
            ))}
          </div>
          <span style={styles.fieldHint}>
            {selectedTenants.size} tenant(s) selected — max {maxVms} VMs
          </span>
        </div>

        {/* Security group selector — only relevant when tenants selected */}
        {selectedTenants.size > 0 && (
          <div style={styles.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={styles.label}>Security groups (per VM)</label>
              {sgNamesAvailable.length > 0 && (
                <button
                  onClick={() =>
                    setSelectedSgNames(
                      selectedSgNames.size === sgNamesAvailable.length
                        ? new Set()
                        : new Set(sgNamesAvailable),
                    )
                  }
                  style={styles.linkBtn}
                >
                  {selectedSgNames.size === sgNamesAvailable.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>
            {sgQueries.some((q) => q.isLoading) ? (
              <span style={styles.fieldHint}>Loading…</span>
            ) : sgNamesAvailable.length === 0 ? (
              <span style={styles.fieldHint}>
                No security groups defined on the selected tenant(s) (other than `default`).
              </span>
            ) : (
              <div style={styles.tenantList}>
                {sgNamesAvailable.map((name) => (
                  <label key={name} style={styles.tenantItem}>
                    <input
                      type="checkbox"
                      checked={selectedSgNames.has(name)}
                      onChange={() => toggleSg(name)}
                    />
                    <span style={{ marginLeft: 6 }}>{name}</span>
                  </label>
                ))}
              </div>
            )}
            <span style={styles.fieldHint}>
              `default` is always attached at the port level by the platform —
              no need to tick it.
            </span>
          </div>
        )}

        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>Number of VMs</label>
            <input
              type="number" min={1} max={maxVms || 1}
              value={vmCount}
              onChange={(e) => setVmCount(Math.max(1, parseInt(e.target.value) || 1))}
              style={styles.input}
              disabled={selectedTenants.size === 0}
            />
            <span style={styles.fieldHint}>
              {tenantsNeeded} of {selectedTenants.size} selected tenant(s) needed
              {vmCount > maxVms && maxVms > 0 && <span style={{ color: "#dc2626" }}> — not enough!</span>}
            </span>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>VM name prefix</label>
            <input
              value={vmPrefix}
              onChange={(e) => setVmPrefix(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>Flavor</label>
            <select value={flavor} onChange={(e) => setFlavor(e.target.value)} style={styles.input}>
              {flavors.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} — {f.cores} vCPU, {f.ram} MB RAM, {f.disk} GB disk
                </option>
              ))}
            </select>
            {selectedFlavor && (
              <span style={styles.fieldHint}>
                {selectedFlavor.cores} vCPU, {selectedFlavor.ram} MB RAM, {selectedFlavor.disk} GB disk
              </span>
            )}
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Image</label>
            <select value={image} onChange={(e) => setImage(e.target.value)} style={styles.input}>
              {images.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Volume size (GB)</label>
            <input
              type="number" min={1}
              value={volumeSize}
              onChange={(e) => setVolumeSize(parseInt(e.target.value) || 20)}
              style={styles.input}
            />
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || selectedTenants.size === 0 || vmCount > maxVms || vmCount < 1}
          style={{ ...styles.btn, opacity: (loading || selectedTenants.size === 0) ? 0.6 : 1 }}
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {preview && (
        <div style={styles.previewSection}>
          <div style={styles.previewHeader}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Generated Configuration</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCopy} style={{ ...styles.btn, background: "#6b7280", padding: "6px 14px" }}>
                Copy
              </button>
              <button onClick={handleDownload} style={{ ...styles.btn, padding: "6px 14px" }}>
                Download main.tf
              </button>
            </div>
          </div>
          <pre style={styles.codeBlock}>{preview}</pre>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  h2: { fontSize: 18, fontWeight: 700 },
  form: {
    background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8,
    padding: 16, marginBottom: 12,
  },
  section: { marginBottom: 12 },
  row: { display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" as const },
  field: { flex: 1, minWidth: 150 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 },
  input: {
    width: "100%", padding: "8px 10px",
    border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13,
    boxSizing: "border-box" as const,
  },
  fieldHint: { fontSize: 11, color: "#888", marginTop: 2, display: "block" },
  linkBtn: {
    background: "none", border: "none", color: "#4f8ef7", fontSize: 12,
    cursor: "pointer", padding: 0, textDecoration: "underline",
  },
  tenantList: {
    display: "flex", flexWrap: "wrap" as const, gap: 8,
    padding: "8px 10px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 4,
  },
  tenantItem: {
    display: "flex", alignItems: "center", fontSize: 13, cursor: "pointer",
    padding: "2px 8px", borderRadius: 4, background: "#f3f4f6",
  },
  btn: {
    padding: "8px 20px", border: "none", borderRadius: 6,
    background: "#4f8ef7", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  error: {
    background: "#fef2f2", color: "#dc2626", padding: "8px 12px",
    borderRadius: 6, fontSize: 12, marginBottom: 12,
  },
  previewSection: {
    border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden",
  },
  previewHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 14px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb",
  },
  codeBlock: {
    margin: 0, padding: 16, fontSize: 12, fontFamily: "monospace",
    background: "#1e1e1e", color: "#d4d4d4", overflow: "auto",
    maxHeight: 500, whiteSpace: "pre" as const,
  },
};
