export async function statusPageUnsubscribeSig(
  sessionSecret: string,
  subscriberId: string
): Promise<string> {
  if (!sessionSecret?.trim()) {
    throw new Error("Missing SESSION_SECRET");
  }
  if (!subscriberId?.trim()) {
    throw new Error("Missing subscriber id");
  }
  return sha256Hex(`${sessionSecret}:status_page_unsubscribe:${subscriberId}`);
}

export async function verifyStatusPageUnsubscribeSig(
  sessionSecret: string,
  subscriberId: string,
  sig: string
): Promise<boolean> {
  try {
    const expected = await statusPageUnsubscribeSig(
      sessionSecret,
      subscriberId
    );
    return expected === sig;
  } catch {
    return false;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
