import { requireTeam as baseRequireTeam } from "@bitwobbly/auth/server";
import { env } from "cloudflare:workers";

import { getDb } from "./db";

export async function requireTeam() {
  const vars = env;
  const db = getDb(vars.DB);
  const result = await baseRequireTeam(db);

  const key =
    typeof result.userId === "string"
      ? `api:${result.teamId}:${result.userId}`
      : `api:${result.teamId}`;

  const { success } = await vars.API_RATE_LIMITER.limit({ key });
  if (!success) {
    throw new Error("Rate limit exceeded");
  }

  return result;
}
