import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import type { MemberInfo } from "../types/api";
import MemberRow from "../components/MemberRow";
import AddMemberModal from "../components/AddMemberModal";
import TenantCard from "../components/TenantCard";
import OrderTenantModal from "../components/OrderTenantModal";
import ProjectCosts from "../components/ProjectCosts";
import SecurityGroups from "../components/SecurityGroups";
import GenerateTerraform from "../components/GenerateTerraform";

interface Quota {
  name: string;
  limit: number;
  usage: number;
}

interface Tenant {
  uuid: string;
  name: string;
  state: string;
  service_name: string;
  marketplace_resource_uuid: string | null;
  quotas: Quota[];
}

export default function ProjectDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showOrderTenant, setShowOrderTenant] = useState(false);
  const [recentOrder, setRecentOrder] = useState(false);

  const { data: project } = useQuery<{ uuid: string; name: string }>({
    queryKey: ["project", uuid],
    queryFn: () => api.get(`/projects/${uuid}`).then((r) => r.data),
    enabled: !!uuid,
  });

  const { data: members = [], isLoading: membersLoading, isError: membersError } = useQuery<MemberInfo[]>({
    queryKey: ["members", uuid],
    queryFn: () => api.get(`/projects/${uuid}/members`).then((r) => r.data),
    enabled: !!uuid,
  });

  const { data: tenants = [], isLoading: tenantsLoading, isError: tenantsError } = useQuery<Tenant[]>({
    queryKey: ["tenants", uuid],
    queryFn: () => api.get(`/projects/${uuid}/tenants`).then((r) => r.data),
    enabled: !!uuid,
    refetchInterval: (query) => {
      // Poll while any tenant is still provisioning or after a recent order
      const data = query.state.data;
      if (recentOrder) return 3000;
      if (!data) return false;
      const provisioning = data.some((t) => t.state !== "OK" && t.state !== "ERRED");
      return provisioning ? 5000 : false;
    },
  });

  return (
    <div>
      <div style={styles.breadcrumb}>
        <Link to="/" style={styles.back}>← Dashboard</Link>
      </div>

      {/* Costs Section */}
      <div style={styles.section}>
        <h2 style={{ ...styles.h2, marginBottom: 16 }}>Costs</h2>
        <ProjectCosts projectUuid={uuid!} />
      </div>

      <div style={styles.divider} />

      {/* Tenants Section */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>Tenants</h2>
          <button style={styles.addBtn} onClick={() => setShowOrderTenant(true)}>
            + Order Tenant
          </button>
        </div>
        <p style={styles.sectionHint}>
          A tenant is your private OpenStack network environment — VMs, subnets, and security groups live inside it.
        </p>

        {tenantsLoading && <div style={styles.state}>Loading tenants…</div>}
        {tenantsError && <div style={styles.stateError}>Failed to load tenants.</div>}

        {!tenantsLoading && !tenantsError && (
          tenants.length === 0 ? (
            <p style={styles.empty}>No tenants yet. Order one to get started.</p>
          ) : (
            <div style={styles.tenantGrid}>
              {tenants.map((t) => (
                <TenantCard key={t.uuid} uuid={t.uuid} name={t.name} state={t.state} service_name={t.service_name} quotas={t.quotas} onChanged={() => queryClient.invalidateQueries({ queryKey: ["tenants", uuid] })} />
              ))}
            </div>
          )
        )}
      </div>

      <div style={styles.divider} />

      {/* Security Groups Section */}
      <div style={styles.section}>
        <SecurityGroups
          projectUuid={uuid!}
          tenants={tenants.map((t) => ({ uuid: t.uuid, name: t.name, state: t.state }))}
        />
      </div>

      <div style={styles.divider} />

      {/* Generate Terraform Section */}
      <div style={styles.section}>
        <GenerateTerraform
          projectUuid={uuid!}
          tenants={tenants}
        />
      </div>

      <div style={styles.divider} />

      {/* Members Section */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>Members</h2>
          <button style={styles.addBtn} onClick={() => setShowAdd(true)}>
            + Add Member
          </button>
        </div>

        {membersLoading && <div style={styles.state}>Loading members…</div>}
        {membersError && <div style={styles.stateError}>Failed to load members.</div>}

        {!membersLoading && !membersError && (
          <div style={styles.tableWrap}>
            {members.length === 0 ? (
              <p style={styles.empty}>No members yet. Add someone to get started.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>User</th>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <MemberRow key={`${m.user_uuid}-${m.role}`} member={m} projectUuid={uuid!} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {showAdd && uuid && (
        <AddMemberModal projectUuid={uuid} onClose={() => setShowAdd(false)} />
      )}
      {showOrderTenant && uuid && (
        <OrderTenantModal
          projectUuid={uuid}
          projectName={project?.name || ""}
          existingTenantNames={tenants.map((t) => t.name)}
          onClose={(ordered) => {
            setShowOrderTenant(false);
            if (ordered) {
              setRecentOrder(true);
              setTimeout(() => setRecentOrder(false), 30000);
            }
          }}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  breadcrumb: { marginBottom: 20 },
  back: { fontSize: 13, color: "#4f8ef7" },
  section: { marginBottom: 8 },
  sectionHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8,
  },
  h2: { fontSize: 18, fontWeight: 700 },
  sectionHint: { fontSize: 12, color: "#888", marginBottom: 14 },
  addBtn: {
    padding: "8px 18px", border: "none", borderRadius: 6,
    background: "#4f8ef7", color: "#fff", fontSize: 14, fontWeight: 600,
  },
  tenantGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12,
  },
  divider: { borderTop: "1px solid #e9ecef", margin: "28px 0" },
  tableWrap: {
    background: "#fff", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
    border: "1px solid #e9ecef", overflow: "hidden",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600,
    color: "#6b7280", background: "#f9fafb", borderBottom: "1px solid #e9ecef",
    textTransform: "uppercase", letterSpacing: "0.05em",
  },
  state: { padding: 40, textAlign: "center", color: "#666" },
  stateError: { padding: 40, textAlign: "center", color: "#dc2626" },
  empty: { color: "#888", fontSize: 13, padding: "4px 0" },
};
