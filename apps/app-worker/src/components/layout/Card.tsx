import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return <div className={`card ${className}`.trim()}>{children}</div>;
}

interface CardTitleProps {
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

export function CardTitle({
  children,
  className = "",
  actions,
}: CardTitleProps) {
  if (!actions) {
    return <div className={`card-title ${className}`.trim()}>{children}</div>;
  }

  return (
    <div className={`card-title card-title-row ${className}`.trim()}>
      <div className="card-title-text">{children}</div>
      <div className="card-title-actions">{actions}</div>
    </div>
  );
}
