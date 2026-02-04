type StatusType =
  | "up"
  | "down"
  | "degraded"
  | "unknown"
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"
  | "maintenance"
  | "error"
  | "warning"
  | "info"
  | "debug"
  | "operational";

type StatusVariant = "status" | "pill";

interface StatusBadgeProps {
  status: StatusType;
  variant?: StatusVariant;
  children?: React.ReactNode;
  className?: string;
}

const statusPillClasses: Record<StatusType, string> = {
  up: "bg-[rgba(26,143,95,0.1)] text-[color:var(--success)]",
  down: "bg-[rgba(240,74,47,0.12)] text-[color:var(--primary-dark)]",
  degraded: "bg-[rgba(245,158,11,0.12)] text-[#b45309]",
  unknown: "bg-[rgba(179,87,42,0.1)] text-[color:var(--warning)]",
  investigating: "bg-[rgba(240,74,47,0.1)] text-[color:var(--primary-dark)]",
  identified: "bg-[rgba(179,87,42,0.1)] text-[color:var(--warning)]",
  monitoring: "bg-[rgba(26,143,95,0.1)] text-[color:var(--success)]",
  resolved: "bg-[rgba(26,143,95,0.15)] text-[color:var(--success)]",
  maintenance: "bg-[rgba(59,130,246,0.12)] text-[#1e40af]",
  error: "bg-[rgba(240,74,47,0.08)] text-[color:var(--primary-dark)]",
  warning: "bg-[rgba(179,87,42,0.08)] text-[color:var(--warning)]",
  info: "bg-[rgba(59,130,246,0.08)] text-[#1e40af]",
  debug: "bg-[rgba(111,98,85,0.08)] text-[color:var(--muted)]",
  operational: "bg-[rgba(26,143,95,0.1)] text-[color:var(--success)]",
};

const statusClasses: Record<StatusType, string> = {
  up: "text-[color:var(--success)] border-[rgba(26,143,95,0.3)] bg-[rgba(26,143,95,0.08)]",
  down: "text-[color:var(--primary-dark)] border-[rgba(240,74,47,0.3)] bg-[rgba(240,74,47,0.08)]",
  degraded:
    "text-[#b45309] border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)]",
  unknown:
    "text-[color:var(--warning)] border-[rgba(179,87,42,0.3)] bg-[rgba(179,87,42,0.08)]",
  investigating:
    "text-[color:var(--primary-dark)] border-[rgba(240,74,47,0.3)] bg-[rgba(240,74,47,0.08)]",
  identified:
    "text-[color:var(--warning)] border-[rgba(179,87,42,0.3)] bg-[rgba(179,87,42,0.08)]",
  monitoring:
    "text-[color:var(--success)] border-[rgba(26,143,95,0.3)] bg-[rgba(26,143,95,0.08)]",
  resolved:
    "text-[color:var(--success)] border-[rgba(26,143,95,0.3)] bg-[rgba(26,143,95,0.08)]",
  maintenance:
    "text-[#1e40af] border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.08)]",
  error:
    "text-[color:var(--primary-dark)] border-[rgba(240,74,47,0.3)] bg-[rgba(240,74,47,0.08)]",
  warning:
    "text-[color:var(--warning)] border-[rgba(179,87,42,0.3)] bg-[rgba(179,87,42,0.08)]",
  info: "text-[#1e40af] border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.08)]",
  debug:
    "text-[color:var(--muted)] border-[rgba(111,98,85,0.3)] bg-[rgba(111,98,85,0.08)]",
  operational:
    "text-[color:var(--success)] border-[rgba(26,143,95,0.3)] bg-[rgba(26,143,95,0.08)]",
};

const statusLabels: Record<StatusType, string> = {
  up: "Up",
  down: "Down",
  degraded: "Degraded",
  unknown: "Unknown",
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  maintenance: "Maintenance",
  error: "Error",
  warning: "Warning",
  info: "Info",
  debug: "Debug",
  operational: "Operational",
};

export function StatusBadge({
  status,
  variant = "pill",
  children,
  className = "",
}: StatusBadgeProps) {
  if (variant === "status") {
    return (
      <span
        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide ${statusClasses[status]} ${className}`}
      >
        {children ?? statusLabels[status]}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusPillClasses[status]} ${className}`}
    >
      {children ?? statusLabels[status]}
    </span>
  );
}
