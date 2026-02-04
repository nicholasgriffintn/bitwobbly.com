import tls from "node:tls";

import { isRecord } from "../guards";
import { daysUntil } from "../monitor-utils";

type TlsPeerCertificate = {
  valid_to?: string;
};

export async function checkTlsExpiry(args: {
  hostname: string;
  port: number;
  timeoutMs: number;
  minDaysRemaining: number;
  allowInvalid: boolean;
}): Promise<{ status: "up" | "down"; reason?: string; latency_ms: number }> {
  const started = Date.now();
  let socket: tls.TLSSocket | null = null;
  try {
    socket = tls.connect({
      host: args.hostname,
      port: args.port,
      servername: args.hostname,
      rejectUnauthorized: !args.allowInvalid,
    });

    const { cert } = await new Promise<{ cert: TlsPeerCertificate }>(
      (resolve, reject) => {
        const onError = (err: unknown) => reject(err);
        const onTimeout = () => reject(new Error("Timeout"));
        const onSecure = () => {
          if (!socket) {
            reject(new Error("Socket closed"));
            return;
          }

          try {
            const peer = socket.getPeerCertificate();
            if (!peer || !isRecord(peer)) {
              resolve({ cert: {} });
              return;
            }

            const validTo =
              typeof peer.valid_to === "string" ? peer.valid_to : undefined;
            resolve({ cert: { valid_to: validTo } });
          } catch (e) {
            reject(e);
          }
        };

        if (!socket) {
          reject(new Error("Socket closed"));
          return;
        }

        socket.setTimeout(args.timeoutMs, onTimeout);
        socket.once("error", onError);
        socket.once("secureConnect", onSecure);
      }
    );

    const validTo = cert.valid_to || null;
    if (!validTo) {
      return {
        status: "down",
        reason: "TLS certificate details unavailable",
        latency_ms: Date.now() - started,
      };
    }

    const expiryMs = Date.parse(validTo);
    if (!Number.isFinite(expiryMs)) {
      return {
        status: "down",
        reason: "TLS certificate expiry parse failed",
        latency_ms: Date.now() - started,
      };
    }

    const remainingDays = daysUntil(expiryMs, Date.now());
    if (remainingDays < args.minDaysRemaining) {
      return {
        status: "down",
        reason: `TLS certificate expires in ${remainingDays}d`,
        latency_ms: Date.now() - started,
      };
    }

    return { status: "up", latency_ms: Date.now() - started };
  } catch (e: unknown) {
    const err = e instanceof Error ? e : null;
    return {
      status: "down",
      reason: err?.message || "TLS check failed",
      latency_ms: Date.now() - started,
    };
  } finally {
    try {
      if (socket) {
        socket.end();
        socket.destroy();
      }
    } catch {
      // ignore
    }
  }
}
