import { useState, type CSSProperties } from "react";
import { createLogger } from "@bitwobbly/shared";

const logger = createLogger({ service: "app-worker" });

interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied!",
  disabled = false,
  className = "outline",
  style,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (disabled || !text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error("Failed to copy:", { err });
    }
  };

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || !text}
      onClick={handleCopy}
      style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", ...style }}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
