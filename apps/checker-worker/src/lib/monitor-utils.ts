export function parseTargetHostPort(
  target: string,
  defaultPort: number
): { hostname: string; port: number } | null {
  const trimmed = target.trim();
  if (!trimmed) return null;

  if (trimmed.includes("://")) {
    try {
      const url = new URL(trimmed);
      const port =
        url.port !== ""
          ? Number(url.port)
          : url.protocol === "http:"
            ? 80
            : url.protocol === "https:"
              ? 443
              : defaultPort;
      if (!Number.isFinite(port) || port <= 0 || port > 65535) return null;
      return { hostname: url.hostname, port };
    } catch {
      return null;
    }
  }

  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon > 0 && trimmed.indexOf("]") === -1) {
    const maybeHost = trimmed.slice(0, lastColon);
    const maybePort = trimmed.slice(lastColon + 1);
    const parsedPort = Number(maybePort);
    if (
      maybeHost &&
      Number.isInteger(parsedPort) &&
      parsedPort > 0 &&
      parsedPort <= 65535
    ) {
      return { hostname: maybeHost, port: parsedPort };
    }
  }

  return { hostname: trimmed, port: defaultPort };
}

export function computeHeartbeatStatus(args: {
  nowSec: number;
  lastSeenSec: number;
  intervalSec: number;
  graceSec: number;
}): { status: "up" | "down"; reason?: string } {
  const intervalSec = Math.max(1, Math.floor(args.intervalSec));
  const graceSec = Math.max(0, Math.floor(args.graceSec));
  const lastSeenSec = Math.max(0, Math.floor(args.lastSeenSec));

  if (lastSeenSec <= 0) {
    return { status: "down", reason: "No heartbeat received yet" };
  }

  const ageSec = args.nowSec - lastSeenSec;
  if (ageSec > intervalSec + graceSec) {
    return {
      status: "down",
      reason: `No heartbeat in ${ageSec}s (expected every ${intervalSec}s)`,
    };
  }

  return { status: "up" };
}

export function daysUntil(expiryMs: number, nowMs: number) {
  const delta = expiryMs - nowMs;
  return Math.floor(delta / (1000 * 60 * 60 * 24));
}
