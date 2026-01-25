import { Link } from "@tanstack/react-router";

import Brand from "./Brand";
import { useAuth } from "@/context/auth";

export default function Sidebar() {
  const { signOut } = useAuth();

  return (
    <aside className="sidebar">
      <Brand />
      <nav className="nav">
        <Link to="/app" activeOptions={{ exact: true }}>
          Overview
        </Link>
        <Link to="/app/monitors">Monitors</Link>
        <Link to="/app/components">Components</Link>
        <Link to="/app/status-pages">Status pages</Link>
        <Link to="/app/incidents">Incidents</Link>
        <Link to="/app/notifications">Notifications</Link>
        <Link to="/app/settings">Settings</Link>
      </nav>
      <button className="ghost" type="button" onClick={signOut}>
        Sign out
      </button>
    </aside>
  );
}
