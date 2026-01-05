export type UUID = string;

export type Monitor = {
  id: UUID;
  team_id: UUID;
  name: string;
  url: string;
  method: "GET";
  timeout_ms: number;
  interval_seconds: number;
  failure_threshold: number;
  enabled: 0 | 1;
  created_at: string;
};

export type StatusPage = {
  id: UUID;
  team_id: UUID;
  slug: string;
  name: string;
  is_public: 0 | 1;
  created_at: string;
};

export type CheckJob = {
  job_id: string;
  team_id: UUID;
  monitor_id: UUID;
  url: string;
  timeout_ms: number;
  failure_threshold: number;
};

export type AlertJob = {
  alert_id: string;
  team_id: UUID;
  monitor_id: UUID;
  status: "down" | "up";
  reason?: string;
  incident_id?: UUID;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${prefix}_${b64}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
