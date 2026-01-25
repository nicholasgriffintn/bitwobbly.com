import type { Queue } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  CHECK_JOBS: Queue;
}
