import { useAuth } from '../lib/auth';

export default function TopBar() {
  const { token } = useAuth();

  return (
    <header className="topbar">
      <div>
        <div className="eyebrow">Team</div>
        <div className="topbar-title">Demo Team</div>
      </div>
      <div className="pill">
        <span className="dot" />
        {token ? 'Admin token set' : 'Read-only'}
      </div>
    </header>
  );
}
