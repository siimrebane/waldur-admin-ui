import React, { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import type { UserInfo } from "../types/api";

export default function LoginPage() {
  const [token, setToken] = useState("");
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (): Promise<UserInfo> =>
      api.post("/auth/login", { token: token.trim() }).then((r) => r.data),
    onSuccess: (user) => {
      setUser(user);
      navigate("/");
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>Waldur Admin</h1>
        <p style={styles.subtitle}>
          Paste your ETAIS API token
          <br />
          <span style={styles.hint}>minu.etais.ee → username → Credentials → API token</span>
        </p>

        <label style={styles.label}>
          API Token
          <input
            type="password"
            style={styles.input}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste token here…"
            autoFocus
            required
            autoComplete="current-password"
            spellCheck={false}
          />
        </label>

        {mutation.isError && (
          <p style={styles.error}>Invalid token. Please check and try again.</p>
        )}

        <button style={styles.btn} type="submit" disabled={!token.trim() || mutation.isPending}>
          {mutation.isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center",
    justifyContent: "center", background: "#f5f6fa",
  },
  card: {
    background: "#fff", borderRadius: 10, padding: 40, width: 380,
    display: "flex", flexDirection: "column", gap: 16,
    boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
  },
  title: { fontSize: 22, fontWeight: 700, textAlign: "center" },
  subtitle: { fontSize: 13, color: "#888", textAlign: "center", marginTop: -8, lineHeight: 1.6 },
  hint: { fontSize: 11, color: "#aaa" },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 },
  input: {
    padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 6,
    fontSize: 13, outline: "none", fontFamily: "monospace",
    letterSpacing: "0.05em",
  },
  error: { color: "#dc2626", fontSize: 13, textAlign: "center" },
  btn: {
    marginTop: 8, padding: "11px 0", border: "none", borderRadius: 6,
    background: "#4f8ef7", color: "#fff", fontSize: 15, fontWeight: 600,
  },
};
