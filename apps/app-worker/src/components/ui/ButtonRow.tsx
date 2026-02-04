import type { ReactNode } from "react";

interface ButtonRowProps {
  children: ReactNode;
  className?: string;
}

export function ButtonRow({ children, className = "" }: ButtonRowProps) {
  return <div className={`button-row ${className}`.trim()}>{children}</div>;
}
