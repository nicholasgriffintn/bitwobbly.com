import { CopyButton } from "@/components/CopyButton";

interface SecretDisplayProps {
  label: string;
  value: string;
  copyable?: boolean;
  monospace?: boolean;
  className?: string;
}

export function SecretDisplay({
  label,
  value,
  copyable = true,
  monospace = true,
  className = "",
}: SecretDisplayProps) {
  return (
    <div className={`mb-3 last:mb-0 ${className}`.trim()}>
      <label className="mb-1 block text-sm font-semibold">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          readOnly
          className={`w-full cursor-pointer rounded-xl border border-[color:var(--stroke)] bg-white px-3.5 py-3 text-sm ${monospace ? "font-mono" : ""}`}
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        {copyable && <CopyButton text={value} />}
      </div>
    </div>
  );
}
