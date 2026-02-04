import type { ReactNode } from "react";

interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  expanded?: boolean;
  expandedContent?: ReactNode;
  className?: string;
}

export function ListRow({
  title,
  subtitle,
  badges,
  actions,
  expanded = false,
  expandedContent,
  className = "",
}: ListRowProps) {
  const hasExpandedContent = expanded && expandedContent;

  const rowContent = (
    <div className="list-row">
      <div className="flex-1">
        <div className="list-title flex flex-wrap items-center gap-2">
          {title}
          {badges}
        </div>
        {subtitle && <div className="muted">{subtitle}</div>}
      </div>
      {actions && <div className="button-row">{actions}</div>}
    </div>
  );

  if (hasExpandedContent) {
    return (
      <div className={`list-item-expanded ${className}`.trim()}>
        {rowContent}
        {expandedContent}
      </div>
    );
  }

  return className ? <div className={className}>{rowContent}</div> : rowContent;
}
