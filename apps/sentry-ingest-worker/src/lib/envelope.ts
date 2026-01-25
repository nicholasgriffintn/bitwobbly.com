export interface EnvelopeHeader {
  event_id?: string;
  dsn?: string;
  sdk?: { name?: string; version?: string };
  sent_at?: string;
  trace?: {
    trace_id?: string;
    public_key?: string;
    release?: string;
    environment?: string;
    user_segment?: string;
  };
}

export interface EnvelopeItemHeader {
  type: string;
  length?: number;
  content_type?: string;
  filename?: string;
  attachment_type?: string;
  item_count?: number;
  platform?: string;
}

export interface EnvelopeItem {
  type: string;
  length?: number;
  content_type?: string;
  filename?: string;
  attachment_type?: string;
  item_count?: number;
  platform?: string;
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

    let length: number;
    let payload: Uint8Array;

    if (itemHeader.length !== undefined) {
      length = itemHeader.length;
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

    items.push({
      type: itemHeader.type,
      length,
      content_type: itemHeader.content_type,
      filename: itemHeader.filename,
      attachment_type: itemHeader.attachment_type,
      item_count: itemHeader.item_count,
      platform: itemHeader.platform,
      payload,
    });
  }

  return { header, items };
}
