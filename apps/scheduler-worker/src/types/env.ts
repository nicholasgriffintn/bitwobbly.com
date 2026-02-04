import type { Queue } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  ALERT_JOBS: Queue;
  CHECK_JOBS: Queue;
}
