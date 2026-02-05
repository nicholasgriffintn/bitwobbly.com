export class PayloadTooLargeError extends Error {}

export async function readBodyWithLimit(
  request: Request,
  maxBytes: number
): Promise<Uint8Array> {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new PayloadTooLargeError();
    }
  }

  if (!request.body) {
    const buf = await request.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new PayloadTooLargeError();
    }
    return new Uint8Array(buf);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) throw new PayloadTooLargeError();
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
