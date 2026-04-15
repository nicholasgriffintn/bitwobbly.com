export const ENABLED = false;

export const TEAM_AI_ASSISTANT_DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.5";

export const DEFAULT_AUTO_AUDIT_INTERVAL_MINUTES = 1440;
export const MIN_AUTO_AUDIT_INTERVAL_MINUTES = 15;
export const MAX_AUTO_AUDIT_INTERVAL_MINUTES = 10_080;

export const DEFAULT_MAX_CONTEXT_ITEMS = 30;
export const MIN_MAX_CONTEXT_ITEMS = 5;
export const MAX_MAX_CONTEXT_ITEMS = 100;

export const DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR = 6;
export const MIN_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR = 1;
export const MAX_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR = 60;

export const DEFAULT_AI_ACTIONS_ENABLED = true;
export const DEFAULT_AI_EXECUTION_MODE = "risk_based";
export const DEFAULT_LOW_RISK_AUTO_ENABLED = true;
export const DEFAULT_GITHUB_AUTOFIX_ENABLED = false;
export const DEFAULT_ACTION_BLOCKLIST = ["run_sql", "shell_command"];
export const DEFAULT_ACTION_EGRESS_ALLOWLIST = [
  "api.github.com",
  "github.com",
];