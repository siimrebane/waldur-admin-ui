import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import api from "../api/client";
import type { UserSearchResult, RoleInfo } from "../types/api";

interface Props {
  projectUuid: string;
  onClose: () => void;
}

export default function AddMemberModal({ projectUuid, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [role, setRole] = useState("PROJECT.MEMBER");
  const qc = useQueryClient();

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: searchResults = [] } = useQuery<UserSearchResult[]>({
    queryKey: ["user-search", debouncedSearch],
    queryFn: () => api.get(`/users/search?q=${encodeURIComponent(debouncedSearch)}`).then((r) => r.data),
    enabled: debouncedSearch.length >= 2,
  });

  const { data: roles = [] } = useQuery<RoleInfo[]>({
    queryKey: ["roles"],
    queryFn: () => api.get("/roles").then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectUuid}/members`, { user_uuid: selectedUser!.uuid, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", projectUuid] });
      onClose();
    },
  });

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Add Member</h2>

        <label style={styles.label}>
          Search user (name or email)
          <input
            style={styles.input}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedUser(null); }}
            placeholder="Type at least 2 characters…"
            autoFocus
          />
        </label>

        {debouncedSearch.length >= 2 && !selectedUser && (
          <div style={styles.results}>
            {searchResults.length === 0 ? (
              <div style={styles.noResults}>No users found</div>
            ) : (
              searchResults.map((u) => (
                <div
                  key={u.uuid}
                  style={styles.resultItem}
                  onClick={() => { setSelectedUser(u); setSearch(u.full_name || u.email); }}
                >
                  <div style={styles.resultName}>{u.full_name || "—"}</div>
                  <div style={styles.resultEmail}>{u.email}</div>
                </div>
              ))
            )}
          </div>
        )}

        {selectedUser && (
          <div style={styles.selectedUser}>
            Selected: <strong>{selectedUser.full_name || selectedUser.email}</strong>
          </div>
        )}

        <label style={styles.label}>
          Role
          <select style={styles.input} value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r.name} value={r.name}>{r.display_name}</option>
            ))}
          </select>
        </label>

        {mutation.isError && (
          <p style={styles.error}>Failed to add member. They may already be a member.</p>
        )}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={styles.submitBtn}
            onClick={() => mutation.mutate()}
            disabled={!selectedUser || mutation.isPending}
          >
            {mutation.isPending ? "Adding…" : "Add Member"}
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
    background: "#fff", borderRadius: 8, padding: 28, width: 440,
    display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  },
  title: { fontSize: 18, fontWeight: 700 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 },
  input: {
    padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6,
    fontSize: 14, outline: "none", fontFamily: "inherit",
  },
  results: {
    border: "1px solid #e5e7eb", borderRadius: 6, maxHeight: 180,
    overflowY: "auto", background: "#fff",
  },
  resultItem: {
    padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f3f4f6",
  },
  resultName: { fontWeight: 500, fontSize: 13 },
  resultEmail: { fontSize: 12, color: "#888" },
  noResults: { padding: "10px 12px", color: "#888", fontSize: 13 },
  selectedUser: {
    background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6,
    padding: "8px 12px", fontSize: 13, color: "#0369a1",
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
