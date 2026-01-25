import { useRouteContext } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";

import { switchTeamFn } from "@/server/functions/teams";

export default function TopBar() {
  const { user, teams } = useRouteContext({ from: "/app" });
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentTeam = teams?.find(
    (t: any) => t.id === (user?.currentTeamId || user?.teamId),
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        event.target instanceof Node &&
        !dropdownRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  const handleSwitchTeam = async (teamId: string) => {
    try {
      await switchTeamFn({ data: { teamId } });
    } catch (err: any) {
      if (err?.status === 307 || err?.isRedirect) {
        window.location.reload();
        return;
      }
      throw err;
    }
  };

  return (
    <header className="topbar">
      <div className="team-selector" ref={dropdownRef}>
        <div className="eyebrow">Team</div>
        <button
          type="button"
          className="team-selector-trigger"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <span className="topbar-title">{currentTeam?.name || "---"}</span>
          {teams && teams.length > 1 && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="team-selector-icon"
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        {showDropdown && teams && teams.length > 1 && (
          <div className="team-dropdown">
            {teams.map((team: any) => (
              <button
                key={team.id}
                type="button"
                onClick={() => {
                  handleSwitchTeam(team.id);
                  setShowDropdown(false);
                }}
                className={`team-dropdown-item ${team.id === (user?.currentTeamId || user?.teamId) ? "active" : ""}`}
              >
                <div className="team-dropdown-name">{team.name}</div>
                <div className="team-dropdown-role">{team.role}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
