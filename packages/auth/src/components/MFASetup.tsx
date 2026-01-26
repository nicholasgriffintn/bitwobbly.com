import { useState } from 'react';

import { useMFA } from '../react/useMFA';

export function MFASetup({ onComplete }: { onComplete?: () => void }) {
  const { setupMFA } = useMFA();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  const handleSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await setupMFA();
      setQrCode(result.qrCodeUrl);
      setSecret(result.secret);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup MFA');
    } finally {
      setLoading(false);
    }
  };

  if (qrCode && secret) {
    return (
      <div className="mfa-setup">
        <h3>Scan QR Code</h3>
        <img src={qrCode} alt="MFA QR Code" />
        <p>Or enter this code manually: {secret}</p>
        <button onClick={onComplete}>Done</button>
      </div>
    );
  }

  return (
    <div className="mfa-setup">
      <h3>Enable Two-Factor Authentication</h3>
      <p>Protect your account with an additional layer of security.</p>
      {error && <div className="form-error">{error}</div>}
      <button onClick={handleSetup} disabled={loading}>
        {loading ? 'Setting up...' : 'Enable MFA'}
      </button>
    </div>
  );
}
