import { useState, useRef, useEffect, type FormEvent } from "react";

export function MFAChallengeForm({
  onVerify,
  className,
}: {
  onVerify: (code: string) => Promise<void>;
  className?: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Enter a 6-digit code");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onVerify(code);
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        ("isRedirect" in err || "isSerializedRedirect" in err)
      ) {
        throw err;
      }
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="form-group">
        <label htmlFor="mfa-code" className="block mb-1">
          MFA Code
        </label>
        <input
          ref={inputRef}
          id="mfa-code"
          type="text"
          inputMode="numeric"
          className="w-full"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          disabled={loading}
          required
        />
      </div>
      {error && <div className="form-error">{error}</div>}
      <button type="submit" disabled={loading || code.length !== 6}>
        {loading ? "Verifying..." : "Verify"}
      </button>
    </form>
  );
}
