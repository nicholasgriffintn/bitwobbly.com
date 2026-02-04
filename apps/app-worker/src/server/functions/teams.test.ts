import assert from "node:assert/strict";
import test from "node:test";

import { CreateTeamInputSchema } from "../validators/teams.ts";

test("CreateTeamInputSchema trims name", () => {
  const parsed = CreateTeamInputSchema.parse({ name: "  My Team  " });
  assert.equal(parsed.name, "My Team");
});

test("CreateTeamInputSchema rejects blank names", () => {
  assert.throws(() => CreateTeamInputSchema.parse({ name: "   " }));
});
