import { getRequestProtocol, useSession } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import {
  isStatusPageUnlocked as isUnlocked,
  nextUnlockedMap,
} from "./status-page-unlock";

type StatusPageSessionData = {
  unlocked?: Record<string, number>;
};

export function useStatusPageSession(): ReturnType<
  typeof useSession<StatusPageSessionData>
> {
  const vars = env;

  // @ts-ignore
  if (!vars.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not set");
  }

  return useSession<StatusPageSessionData>({
    name: "status-page",
    // @ts-ignore
    password: vars.SESSION_SECRET,
    cookie: {
      secure: getRequestProtocol() === "https",
      sameSite: "lax",
      httpOnly: true,
      path: "/status",
      maxAge: 7 * 24 * 60 * 60,
    },
  });
}

export function isStatusPageUnlocked(
  session: Awaited<ReturnType<typeof useStatusPageSession>>,
  slug: string
): boolean {
  return isUnlocked(session.data.unlocked, slug);
}

export async function unlockStatusPage(
  session: Awaited<ReturnType<typeof useStatusPageSession>>,
  slug: string
): Promise<void> {
  await session.update({
    ...session.data,
    unlocked: nextUnlockedMap(session.data.unlocked, slug),
  });
}
