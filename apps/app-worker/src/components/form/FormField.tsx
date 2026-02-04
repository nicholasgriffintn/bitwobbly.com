import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  optional?: boolean;
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
  optional = false,
}: FormFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor}>
        {label}
        {optional && " (optional)"}
      </label>
      {children}
      {hint && (
        <div className="mt-1 text-xs text-[color:var(--muted)]">{hint}</div>
      )}
      {error && <div className="form-error mt-1">{error}</div>}
    </div>
  );
}
