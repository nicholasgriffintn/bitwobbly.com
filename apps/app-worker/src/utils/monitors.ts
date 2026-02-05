export function getMonitorEndpointUrl(
  monitorId: string,
  tokenType: string,
  origin: string = typeof window !== "undefined" ? window.location.origin : ""
): string {
  const endpoint = tokenType === "heartbeat" ? "heartbeats" : "webhooks";
  return `${origin}/api/${endpoint}/${monitorId}`;
}
