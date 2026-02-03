import { getNumber, isRecord } from "./guards";

export function extractJsonFromEnvelope(
  data: Uint8Array,
  itemIndex: number,
): unknown | null {
  const decoder = new TextDecoder();
  let offset = 0;

  const headerEnd = data.indexOf(0x0a);
  if (headerEnd === -1) return null;

  offset = headerEnd + 1;

  let currentItem = 0;
  while (offset < data.length) {
    const itemHeaderEnd = data.indexOf(0x0a, offset);
    if (itemHeaderEnd === -1) break;

    const itemHeaderJson = decoder.decode(data.slice(offset, itemHeaderEnd));
    let itemHeader: unknown;
    try {
      itemHeader = JSON.parse(itemHeaderJson);
    } catch {
      return null;
    }
    if (!isRecord(itemHeader)) return null;

    offset = itemHeaderEnd + 1;

    let length: number;
    let payload: Uint8Array;

    const headerLength = getNumber(itemHeader, "length");
    if (headerLength !== undefined) {
      length = headerLength;
      payload = data.slice(offset, offset + length);
      offset += length + 1;
    } else {
      const payloadEnd = data.indexOf(0x0a, offset);
      if (payloadEnd === -1) {
        payload = data.slice(offset);
        offset = data.length;
      } else {
        payload = data.slice(offset, payloadEnd);
        offset = payloadEnd + 1;
      }
      length = payload.length;
    }

    if (currentItem === itemIndex) {
      try {
        const payloadText = decoder.decode(payload);
        return JSON.parse(payloadText);
      } catch {
        return null;
      }
    }

    currentItem++;
  }

  return null;
}

