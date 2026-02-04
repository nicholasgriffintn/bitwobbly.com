import type { ReactNode } from "react";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "info";
type BadgeSize = "small" | "default";

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-[color:var(--stroke)] bg-[#fff7ef]",
  success:
    "border-[rgba(26,143,95,0.35)] text-[color:var(--success)] bg-[rgba(26,143,95,0.08)]",
  warning:
    "border-[rgba(179,87,42,0.35)] text-[color:var(--warning)] bg-[rgba(179,87,42,0.08)]",
  danger:
    "border-[rgba(240,74,47,0.4)] text-[color:var(--primary-dark)] bg-[rgba(240,74,47,0.08)]",
  muted:
    "border-[rgba(111,98,85,0.25)] text-[color:var(--muted)] bg-[rgba(111,98,85,0.06)]",
  info: "border-[rgba(59,130,246,0.35)] text-[#1e40af] bg-[rgba(59,130,246,0.08)]",
};

const sizeClasses: Record<BadgeSize, string> = {
  default: "px-3.5 py-2 text-[13px]",
  small: "px-2.5 py-1 text-xs",
};

export function Badge({
  variant = "default",
  size = "default",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </span>
  );
}
