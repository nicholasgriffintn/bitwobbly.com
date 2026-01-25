export interface EnvelopeHeader {
  event_id?: string;
  dsn?: string;
  sdk?: { name?: string; version?: string };
  sent_at?: string;
}

export interface EnvelopeItem {
  type: string;
  length?: number;
  content_type?: string;
  payload: Uint8Array;
}

export interface ParsedEnvelope {
  header: EnvelopeHeader;
  items: EnvelopeItem[];
}

export function parseEnvelope(data: Uint8Array): ParsedEnvelope {
  const decoder = new TextDecoder();
  let offset = 0;

  const headerEnd = data.indexOf(0x0a);
  if (headerEnd === -1) throw new Error("Invalid envelope: no header");

  const headerJson = decoder.decode(data.slice(0, headerEnd));
  const header = JSON.parse(headerJson) as EnvelopeHeader;
  offset = headerEnd + 1;

  const items: EnvelopeItem[] = [];

  while (offset < data.length) {
    const itemHeaderEnd = data.indexOf(0x0a, offset);
    if (itemHeaderEnd === -1) break;

    const itemHeaderJson = decoder.decode(data.slice(offset, itemHeaderEnd));
    const itemHeader = JSON.parse(itemHeaderJson);
    offset = itemHeaderEnd + 1;

    const length = itemHeader.length ?? 0;
    const payload = data.slice(offset, offset + length);
    offset += length + 1;

    items.push({
      type: itemHeader.type,
      length,
      content_type: itemHeader.content_type,
      payload,
    });
  }

  return { header, items };
}
