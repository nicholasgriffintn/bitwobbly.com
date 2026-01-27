import { useState, useRef, useEffect, type FormEvent } from 'react';

export function ForgotPasswordForm({
  onSubmit,
  className,
}: {
  onSubmit: (code: string) => Promise<void>;
  className?: string;
}) {
  const [email, setEmail] = useState('');
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
    if (email.length === 0) {
      setError('Enter your email address');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="form-group">
        <label htmlFor="email" className="block mb-1">
          Email Address
        </label>
        <input
          ref={inputRef}
          id="email"
          type="email"
          inputMode="email"
          className="w-full"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          disabled={loading}
          required
        />
      </div>
      {error && <div className="form-error">{error}</div>}
      <button type="submit" disabled={loading || email.length === 0}>
        {loading ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}
