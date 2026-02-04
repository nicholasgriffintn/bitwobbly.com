import type { ReactNode } from "react";

interface ListRowProps {
  title: ReactNode;
  titleClassName?: string;
  subtitle?: ReactNode;
  subtitleClassName?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  expanded?: boolean;
  expandedContent?: ReactNode;
  className?: string;
}

export function ListRow({
  title,
  titleClassName,
  subtitle,
  subtitleClassName,
  badges,
  actions,
  expanded = false,
  expandedContent,
  className = "",
}: ListRowProps) {
  const hasExpandedContent = expanded && expandedContent;

  const resolvedTitleClassName =
    titleClassName ?? "list-title flex flex-wrap items-center gap-2";
  const resolvedSubtitleClassName = subtitleClassName ?? "muted";

  const rowContent = (
    <div className="list-row">
      <div className="flex-1">
        <div className={resolvedTitleClassName}>
          {title}
          {badges}
        </div>
        {subtitle && (
          <div className={resolvedSubtitleClassName}>{subtitle}</div>
        )}
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
