export function createAbortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("name" in error && error.name === "AbortError") return true;
  if (
    "message" in error &&
    typeof error.message === "string" &&
    error.message.toLowerCase().includes("aborted")
  ) {
    return true;
  }
  return false;
}
