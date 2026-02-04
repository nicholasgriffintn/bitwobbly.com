import test from "node:test";
import assert from "node:assert/strict";

import {
  STATUS_PAGE_UNLOCK_TTL_SECONDS,
  isStatusPageUnlocked,
  nextUnlockedMap,
} from "./status-page-unlock.ts";

test("isStatusPageUnlocked returns false when missing", () => {
  assert.equal(isStatusPageUnlocked(undefined, "acme"), false);
  assert.equal(isStatusPageUnlocked({}, "acme"), false);
});

test("isStatusPageUnlocked honours TTL", () => {
  const now = 1_700_000_000;
  const unlocked = { acme: now - (STATUS_PAGE_UNLOCK_TTL_SECONDS - 1) };
  assert.equal(isStatusPageUnlocked(unlocked, "acme", now), true);
  assert.equal(
    isStatusPageUnlocked(
      { acme: now - (STATUS_PAGE_UNLOCK_TTL_SECONDS + 1) },
      "acme",
      now
    ),
    false
  );
});

test("nextUnlockedMap caps entries and keeps newest", () => {
  const now = 1_700_000_000;
  const unlocked: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    unlocked[`slug-${i}`] = now - i;
  }

  const next = nextUnlockedMap(unlocked, "fresh", now + 10);
  assert.equal(Object.keys(next).length, 25);
  assert.equal(next.fresh, now + 10);
});
