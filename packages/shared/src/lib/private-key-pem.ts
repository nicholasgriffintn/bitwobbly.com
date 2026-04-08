function decodePemBody(
  input: string,
  beginMarker: string,
  endMarker: string
): Uint8Array | null {
  const normalised = input.replace(/\\n/g, "\n").trim();
  if (!normalised.includes(beginMarker) || !normalised.includes(endMarker)) {
    return null;
  }

  const stripped = normalised
    .replace(beginMarker, "")
    .replace(endMarker, "")
    .replace(/\s+/g, "");

  let decoded: string;
  try {
    decoded = atob(stripped);
  } catch {
    throw new Error("Private key PEM was invalid base64");
  }

  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function encodeDerLength(length: number): Uint8Array {
  if (length < 128) {
    return Uint8Array.of(length);
  }

  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }

  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function derEncode(tag: number, content: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.of(tag), encodeDerLength(content.length), content);
}

function wrapPkcs1RsaPrivateKeyAsPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const rsaAlgorithmIdentifier = Uint8Array.of(
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00
  );
  const privateKey = derEncode(0x04, pkcs1Der);
  return derEncode(0x30, concatBytes(version, rsaAlgorithmIdentifier, privateKey));
}

export function parsePrivateKeyPemToPkcs8ArrayBuffer(input: string): ArrayBuffer {
  const pkcs8 = decodePemBody(
    input,
    "-----BEGIN PRIVATE KEY-----",
    "-----END PRIVATE KEY-----"
  );
  if (pkcs8) {
    return toArrayBuffer(pkcs8);
  }

  const pkcs1 = decodePemBody(
    input,
    "-----BEGIN RSA PRIVATE KEY-----",
    "-----END RSA PRIVATE KEY-----"
  );
  if (pkcs1) {
    const wrapped = wrapPkcs1RsaPrivateKeyAsPkcs8(pkcs1);
    return toArrayBuffer(wrapped);
  }

  throw new Error(
    "Private key must be PEM with BEGIN PRIVATE KEY or BEGIN RSA PRIVATE KEY"
  );
}
