import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "outline" | "ghost" | "link";
type ButtonColor = "default" | "success" | "warning" | "danger" | "info";
type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: ButtonColor;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  color = "default",
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses = `${variant === "outline" ? "outline" : ""} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`;
  const colorClasses = color !== "default" ? `button-${color}` : "";
  const sizeClasses =
    size === "xs"
      ? "text-xs px-1 py-0.5"
      : size === "sm"
        ? "text-sm px-2 py-1"
        : size === "lg"
          ? "text-lg px-4 py-3"
          : "text-base px-3 py-2";

  return (
    <button
      className={`${baseClasses} ${colorClasses} ${sizeClasses} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
