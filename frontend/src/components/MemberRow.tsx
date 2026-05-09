import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import type { MemberInfo } from "../types/api";
import RoleBadge from "./RoleBadge";

interface Props {
  member: MemberInfo;
  projectUuid: string;
}

export default function MemberRow({ member, projectUuid }: Props) {
  const qc = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: () =>
      api.delete(`/projects/${projectUuid}/members/${member.user_uuid}`, {
        data: { role: member.role },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", projectUuid] }),
  });

  return (
    <tr style={styles.row}>
      <td style={styles.cell}>
        <div style={styles.name}>{member.full_name || "—"}</div>
        <div style={styles.email}>{member.email}</div>
      </td>
      <td style={styles.cell}><RoleBadge role={member.role} /></td>
      <td style={{ ...styles.cell, textAlign: "right" }}>
        <button
          style={styles.removeBtn}
          onClick={() => { if (confirm(`Remove ${member.full_name || member.email}?`)) removeMutation.mutate(); }}
          disabled={removeMutation.isPending}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { borderBottom: "1px solid #f0f0f0" },
  cell: { padding: "12px 16px", verticalAlign: "middle" },
  name: { fontWeight: 500, marginBottom: 2 },
  email: { fontSize: 12, color: "#888" },
  removeBtn: {
    background: "transparent",
    border: "1px solid #fca5a5",
    color: "#dc2626",
    borderRadius: 4,
    padding: "4px 10px",
    fontSize: 12,
  },
};
