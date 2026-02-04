import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "outline" | "ghost" | "link";
type ButtonColor = "default" | "success" | "warning" | "danger" | "info";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  color?: ButtonColor;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  color = "default",
  children,
  className = "",
  ...props
}: ButtonProps) {
  const baseClasses = variant === "outline" ? "outline" : "";
  const colorClasses = color !== "default" ? `button-${color}` : "";

  return (
    <button
      className={`${baseClasses} ${colorClasses} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
