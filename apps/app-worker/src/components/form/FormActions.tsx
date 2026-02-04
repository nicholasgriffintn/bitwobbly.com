import type { ReactNode } from "react";

interface FormActionsProps {
  children: ReactNode;
  className?: string;
}

export function FormActions({ children, className = "" }: FormActionsProps) {
  return (
    <div className={`button-row mt-4 ${className}`.trim()}>{children}</div>
  );
}
