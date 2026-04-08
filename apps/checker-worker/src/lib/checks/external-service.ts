import type { CheckJob } from "@bitwobbly/shared";

import { isRecord } from "../guards";
import { isHttpUrl } from "../url-utils";

export async function checkExternalService(
  job: CheckJob,
  timeout: number
): Promise<{ status: "up" | "down"; reason?: string; latency_ms: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort("timeout"), timeout);

  try {
    let config;
    try {
      config = job.external_config ? JSON.parse(job.external_config) : null;
    } catch {
      return {
        status: "down",
        reason: "Invalid external config",
        latency_ms: Date.now() - started,
      };
    }

    const serviceType = config?.serviceType;
    const statusUrl =
      typeof config?.statusUrl === "string" ? config.statusUrl : job.url;

    if (serviceType && serviceType.startsWith("cloudflare-")) {
      const cfStatusUrl = "https://www.cloudflarestatus.com/api/v2/status.json";
      const res = await fetch(cfStatusUrl, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });

      if (!res.ok) {
        return {
          status: "down",
          reason: `Cloudflare status API returned ${res.status}`,
          latency_ms: Date.now() - started,
        };
      }

      const data: unknown = await res.json();
      let indicator: string | undefined;
      if (isRecord(data) && isRecord(data.status)) {
        indicator =
          typeof data.status.indicator === "string"
            ? data.status.indicator
            : undefined;
      }

      if (indicator === "none" || indicator === "minor") {
        return {
          status: "up",
          latency_ms: Date.now() - started,
        };
      }

      return {
        status: "down",
        reason: `Cloudflare status: ${indicator || "unknown"}`,
        latency_ms: Date.now() - started,
      };
    }

    if (!statusUrl || !isHttpUrl(statusUrl)) {
      return {
        status: "down",
        reason: "Invalid external status URL",
        latency_ms: Date.now() - started,
      };
    }

    const res = await fetch(statusUrl, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
    });
    const latency_ms = Date.now() - started;
    const status = res.ok ? "up" : "down";
    const reason = !res.ok ? `HTTP ${res.status}` : undefined;

    return { status, reason, latency_ms };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : null;
    return {
      status: "down",
      reason:
        error?.name === "AbortError"
          ? "Timeout"
          : error?.message || "Fetch error",
      latency_ms: Date.now() - started,
    };
  } finally {
    clearTimeout(t);
  }
}

