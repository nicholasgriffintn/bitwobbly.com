import { useAuth } from '@/context/auth';

export default function TopBar() {
  const { user } = useAuth();

  return (
    <header className="topbar">
      <div>
        <div className="eyebrow">Team</div>
        <div className="topbar-title">{user?.email || '---'}</div>
      </div>
    </header>
  );
}
