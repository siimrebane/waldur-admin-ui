const COLORS: Record<string, { bg: string; text: string }> = {
  "PROJECT.ADMIN":   { bg: "#e8f0fe", text: "#1a56db" },
  "PROJECT.MANAGER": { bg: "#fef3c7", text: "#92400e" },
  "PROJECT.MEMBER":  { bg: "#d1fae5", text: "#065f46" },
};

const LABELS: Record<string, string> = {
  "PROJECT.ADMIN":   "Admin",
  "PROJECT.MANAGER": "Manager",
  "PROJECT.MEMBER":  "Member",
};

interface Props { role: string; }

export default function RoleBadge({ role }: Props) {
  const color = COLORS[role] ?? { bg: "#f3f4f6", text: "#374151" };
  return (
    <span style={{
      background: color.bg,
      color: color.text,
      borderRadius: 12,
      padding: "2px 10px",
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {LABELS[role] ?? role}
    </span>
  );
}
