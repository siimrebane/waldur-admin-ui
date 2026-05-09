import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import type { OrgSummary } from "../types/api";

interface Props {
  orgs: OrgSummary[];
  onClose: () => void;
}

export default function CreateProjectModal({ orgs, onClose }: Props) {
  const [name, setName] = useState("");
  const [orgUuid, setOrgUuid] = useState(orgs[0]?.uuid ?? "");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.post("/projects", { name, org_uuid: orgUuid }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
  });

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>New Project</h2>

        <label style={styles.label}>
          Organization
          <select style={styles.input} value={orgUuid} onChange={(e) => setOrgUuid(e.target.value)}>
            {orgs.map((o) => (
              <option key={o.uuid} value={o.uuid}>{o.name}</option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Project name
          <input
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Research Project"
            autoFocus
          />
        </label>

        {mutation.isError && (
          <p style={styles.error}>Failed to create project. Please try again.</p>
        )}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={styles.submitBtn}
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || !orgUuid || mutation.isPending}
          >
            {mutation.isPending ? "Creating…" : "Create"}
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
    background: "#fff", borderRadius: 8, padding: 28, width: 420,
    display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  },
  title: { fontSize: 18, fontWeight: 700 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 },
  input: {
    padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6,
    fontSize: 14, outline: "none", fontFamily: "inherit",
  },
  error: { color: "#dc2626", fontSize: 13 },
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
