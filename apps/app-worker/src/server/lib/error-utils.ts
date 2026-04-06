import { isRecord } from "./type-guards";

export function toErrorMessage(
  error: unknown,
  fallback = "Unexpected error"
): string {
  if (error instanceof Error) return error.message;
  return fallback;
}

export function isRedirectError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.isRedirect === true || error.isSerializedRedirect === true;
}

export function isRateLimitError(error: unknown): boolean {
  return toErrorMessage(error) === "Rate limit exceeded";
}
