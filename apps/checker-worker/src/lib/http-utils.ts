export async function readResponseTextUpTo(res: Response, maxBytes: number) {
  const body = res.body;
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let readBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      readBytes += value.byteLength;
      out += decoder.decode(value, { stream: true });

      if (readBytes >= maxBytes) {
        out += decoder.decode();
        return out;
      }
    }

    out += decoder.decode();
    return out;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

