import type { ReactNode } from "react";

interface SuccessBoxProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function SuccessBox({
  title,
  children,
  className = "",
}: SuccessBoxProps) {
  return (
    <div
      className={`rounded-xl border-2 border-[color:var(--success)] bg-[#f8f9fa] p-4 ${className}`.trim()}
    >
      <div className="mb-3 flex items-center gap-2 text-base font-semibold text-[color:var(--success)]">
        <span>✓</span>
        {title}
      </div>
      {children}
    </div>
  );
}
