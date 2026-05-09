import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "../api/client";
import type { OrgSummary, ProjectSummary, ProjectCosts } from "../types/api";
import CreateProjectModal from "../components/CreateProjectModal";

export default function DashboardPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: orgs = [], isLoading, isError } = useQuery<OrgSummary[]>({
    queryKey: ["orgs"],
    queryFn: () => api.get("/orgs").then((r) => r.data),
  });

  if (isLoading) return <div style={styles.state}>Loading organizations…</div>;
  if (isError) return <div style={styles.stateError}>Failed to load organizations.</div>;

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.h1}>Dashboard</h1>
        <button style={styles.newBtn} onClick={() => setShowCreate(true)}>
          + New Project
        </button>
      </div>

      {orgs.length === 0 && (
        <p style={styles.empty}>You are not a member of any organization.</p>
      )}

      {orgs.map((org) => (
        <OrgSection key={org.uuid} org={org} />
      ))}

      {showCreate && (
        <CreateProjectModal orgs={orgs} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function OrgSection({ org }: { org: OrgSummary }) {
  const { data: projects = [], isLoading } = useQuery<ProjectSummary[]>({
    queryKey: ["projects", org.uuid],
    queryFn: () => api.get(`/orgs/${org.uuid}/projects`).then((r) => r.data),
  });

  return (
    <section style={styles.section}>
      <div style={styles.orgHeader}>
        <h2 style={styles.orgName}>{org.name}</h2>
        <span style={styles.orgMeta}>{org.projects_count} project{org.projects_count !== 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <p style={styles.loading}>Loading projects…</p>
      ) : projects.length === 0 ? (
        <p style={styles.empty}>No projects yet.</p>
      ) : (
        <div style={styles.grid}>
          {projects.map((p) => (
            <ProjectCard key={p.uuid} project={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const { data } = useQuery<ProjectCosts>({
    queryKey: ["costs", project.uuid],
    queryFn: () => api.get(`/projects/${project.uuid}/costs`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const currentPrice = data?.current?.price ?? null;

  return (
    <Link to={`/projects/${project.uuid}`} style={styles.card}>
      <div style={styles.cardTop}>
        <div style={styles.cardName}>{project.name}</div>
        {currentPrice !== null && (
          <div style={styles.costBadge}>€{currentPrice.toFixed(2)}</div>
        )}
      </div>
      {project.description && <div style={styles.cardDesc}>{project.description}</div>}
    </Link>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  h1: { fontSize: 22, fontWeight: 700 },
  newBtn: {
    padding: "8px 18px", border: "none", borderRadius: 6,
    background: "#4f8ef7", color: "#fff", fontSize: 14, fontWeight: 600,
  },
  section: { marginBottom: 36 },
  orgHeader: { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 },
  orgName: { fontSize: 17, fontWeight: 700 },
  orgMeta: { fontSize: 12, color: "#888" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 },
  card: {
    background: "#fff", borderRadius: 8, padding: "16px 18px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #e9ecef",
    transition: "box-shadow 0.15s",
    display: "block",
  },
  cardTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  cardName: { fontWeight: 600, flex: 1, minWidth: 0 },
  costBadge: {
    fontSize: 11, fontWeight: 700, color: "#4f8ef7",
    background: "#eff6ff", borderRadius: 10, padding: "2px 7px",
    whiteSpace: "nowrap", flexShrink: 0,
  },
  cardDesc: { fontSize: 12, color: "#888", overflow: "hidden", display: "-webkit-box",
    WebkitLineClamp: 2, WebkitBoxOrient: "vertical" },
  state: { padding: 40, textAlign: "center", color: "#666" },
  stateError: { padding: 40, textAlign: "center", color: "#dc2626" },
  loading: { color: "#888", fontSize: 13 },
  empty: { color: "#888", fontSize: 13 },
};
