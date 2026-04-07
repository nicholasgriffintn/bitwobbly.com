import { isRecord, readStringField } from "../lib/type-guards.ts";

function extractChoiceContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const textChunks: string[] = [];
  for (const item of content) {
    if (!isRecord(item)) continue;
    const obj = item;
    if (obj.type === "text" && typeof obj.text === "string") {
      textChunks.push(obj.text);
    }
  }
  return textChunks.join("\n");
}

export function extractAiTextContent(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (!isRecord(raw)) return null;

  const response = readStringField(raw, "response");
  if (response !== null) return response;
  const outputText = readStringField(raw, "output_text");
  if (outputText !== null) return outputText;
  const text = readStringField(raw, "text");
  if (text !== null) return text;

  if (raw.result && isRecord(raw.result)) {
    const nested = extractAiTextContent(raw.result);
    if (nested !== null) return nested;
  }

  if (Array.isArray(raw.choices) && raw.choices.length > 0) {
    const first = raw.choices[0];
    if (isRecord(first)) {
      if (isRecord(first.message)) {
        const content = extractChoiceContent(first.message.content);
        if (content) return content;
      }
      const choiceText = readStringField(first, "text");
      if (choiceText !== null) return choiceText;
    }
  }

  return null;
}

export function extractAiTextResponse(raw: unknown): string {
  const content = extractAiTextContent(raw);
  if (content !== null) return content.trim();

  if (typeof raw === "string") return raw.trim();
  if (!isRecord(raw)) return String(raw ?? "").trim();

  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw).trim();
  }
}
