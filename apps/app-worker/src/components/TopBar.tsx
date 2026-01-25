import { useRouteContext } from "@tanstack/react-router";

export default function TopBar() {
  const { user } = useRouteContext({ from: "/app" });

  return (
    <header className="topbar">
      <div>
        <div className="eyebrow">Team</div>
        <div className="topbar-title">{user?.email || "---"}</div>
      </div>
    </header>
  );
}
