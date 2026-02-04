import type { ReactNode } from "react";

interface PageProps {
  children: ReactNode;
  className?: string;
}

export function Page({ children, className = "" }: PageProps) {
  return <div className={`page ${className}`.trim()}>{children}</div>;
}
