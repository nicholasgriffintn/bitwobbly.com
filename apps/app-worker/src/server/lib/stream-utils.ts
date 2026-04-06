import { isRecord } from "./type-guards";

export function isReadableByteStream(
  value: unknown
): value is ReadableStream<Uint8Array> {
  if (!isRecord(value)) return false;
  const getReader = value.getReader;
  return typeof getReader === "function";
}
