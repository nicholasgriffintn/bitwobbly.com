export function toBase64UrlFromText(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 4096) {
    const chunk = bytes.slice(index, index + 4096);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function toBase64UrlFromBytes(value: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < value.length; index += 4096) {
    const chunk = value.slice(index, index + 4096);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
