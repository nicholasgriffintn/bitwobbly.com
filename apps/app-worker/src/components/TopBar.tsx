import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function TopBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="topbar">
      <div>
        <div className="eyebrow">Team</div>
        <div className="topbar-title">{user?.email || 'Demo Team'}</div>
      </div>
      <div className="topbar-actions">
        <button 
          type="button" 
          className="outline" 
          onClick={handleSignOut}
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
