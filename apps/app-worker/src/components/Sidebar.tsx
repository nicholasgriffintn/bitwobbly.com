import { NavLink } from 'react-router-dom';

import Brand from './Brand';
import { useAuth } from '../lib/auth';

export default function Sidebar() {
  const { logout } = useAuth();

  return (
    <aside className="sidebar">
      <Brand />
      <nav className="nav">
        <NavLink to="/app" end>
          Overview
        </NavLink>
        <NavLink to="/app/monitors">Monitors</NavLink>
        <NavLink to="/app/status-pages">Status pages</NavLink>
        <NavLink to="/app/notifications">Notifications</NavLink>
        <NavLink to="/app/settings">Settings</NavLink>
      </nav>
      <button className="ghost" type="button" onClick={logout}>
        Sign out
      </button>
    </aside>
  );
}
