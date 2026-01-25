import { useState } from "react";

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      type="button"
      className="outline"
      onClick={handleCopy}
      style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
