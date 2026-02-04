import type { ReactNode } from "react";

interface ListContainerProps {
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  className?: string;
}

export function ListContainer({
  children,
  emptyMessage = "No items yet.",
  isEmpty = false,
  className = "",
}: ListContainerProps) {
  if (isEmpty) {
    return (
      <div className={`list ${className}`.trim()}>
        <div className="muted">{emptyMessage}</div>
      </div>
    );
  }

  return <div className={`list ${className}`.trim()}>{children}</div>;
}
