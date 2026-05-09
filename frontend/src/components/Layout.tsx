import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "../store/authStore";
import api from "../api/client";

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const clearUser = useAuthStore((s) => s.clearUser);
  const navigate = useNavigate();

  const logoutMutation = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => {
      clearUser();
      navigate("/login");
    },
  });

  return (
    <div style={styles.shell}>
      <nav style={styles.nav}>
        <div style={styles.navBrand}>Waldur Admin</div>
        <div style={styles.navLinks}>
          <NavLink to="/" style={({ isActive }) => ({ ...styles.navLink, ...(isActive ? styles.navLinkActive : {}) })}>
            Dashboard
          </NavLink>
        </div>
        <div style={styles.navUser}>
          <span style={styles.userName}>{user?.full_name || user?.email}</span>
          <button
            style={styles.logoutBtn}
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            Logout
          </button>
        </div>
      </nav>
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: { display: "flex", flexDirection: "column", minHeight: "100vh" },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: 24,
    padding: "0 24px",
    height: 56,
    background: "#1a1a2e",
    color: "#fff",
    flexShrink: 0,
  },
  navBrand: { fontWeight: 700, fontSize: 16, marginRight: 8 },
  navLinks: { display: "flex", gap: 16, flex: 1 },
  navLink: { color: "#ccc", fontSize: 14, padding: "4px 0" },
  navLinkActive: { color: "#fff", borderBottom: "2px solid #4f8ef7" },
  navUser: { display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" },
  userName: { fontSize: 13, color: "#aaa" },
  logoutBtn: {
    background: "transparent",
    border: "1px solid #555",
    color: "#ccc",
    borderRadius: 4,
    padding: "4px 12px",
    fontSize: 13,
  },
  main: { flex: 1, padding: 32, maxWidth: 1100, margin: "0 auto", width: "100%" },
};
