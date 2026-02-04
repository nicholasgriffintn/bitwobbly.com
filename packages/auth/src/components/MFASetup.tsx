import { useState, type FormEvent } from "react";
import { QRCode } from "react-qrcode";

import { useAuth } from "../react/AuthProvider";

export function MFASetup({ onComplete }: { onComplete?: () => void }) {
  const { setupMFA, verifyMFASetup } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const handleSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await setupMFA();
      setQrCode(result.qrCodeUrl);
      setSecret(result.secret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to setup MFA");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Enter a 6-digit code");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      await verifyMFASetup(code);
      onComplete?.();
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        ("isRedirect" in err || "isSerializedRedirect" in err)
      ) {
        throw err;
      }
      setError(err instanceof Error ? err.message : "Failed to verify MFA");
    } finally {
      setVerifying(false);
    }
  };

  if (qrCode && secret) {
    return (
      <div className="mfa-setup">
        <h2>Scan The QR Code Below</h2>
        <div
          className="mfa-setup-qr"
          style={{
            display: "flex",
            justifyContent: "center",
            margin: "16px 0",
          }}
        >
          <QRCode value={qrCode} size={200} />
        </div>
        <p className="mfa-secret" style={{ wordBreak: "break-all" }}>
          Or enter this code manually: {secret}
        </p>
        <form onSubmit={handleVerify}>
          <label htmlFor="mfa-setup-code" className="block mb-1">
            MFA Code
          </label>
          <input
            id="mfa-setup-code"
            type="text"
            inputMode="numeric"
            className="w-full"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            disabled={verifying}
            required
          />
          {error && <div className="form-error">{error}</div>}
          <button type="submit" disabled={verifying || code.length !== 6}>
            {verifying ? "Verifying..." : "Verify & enable"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mfa-setup">
      {error && <div className="form-error">{error}</div>}
      <button onClick={handleSetup} disabled={loading}>
        {loading ? "Setting up..." : "Enable MFA"}
      </button>
    </div>
  );
}
