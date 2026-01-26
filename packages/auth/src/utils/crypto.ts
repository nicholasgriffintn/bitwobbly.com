import { randomId } from '@bitwobbly/shared';

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    data,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const hash = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hash.length);
  combined.set(salt);
  combined.set(hash, salt.length);
  return btoa(String.fromCharCode(...combined));
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const combined = new Uint8Array(
    atob(storedHash)
      .split('')
      .map((char) => char.charCodeAt(0)),
  );
  const salt = combined.slice(0, 16);
  const storedKey = combined.slice(16);
  try {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      data,
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    );
    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      256,
    );
    const derivedKey = new Uint8Array(derivedBits);
    if (derivedKey.length !== storedKey.length) return false;
    let result = 0;
    for (let i = 0; i < derivedKey.length; i++)
      result |= derivedKey[i] ^ storedKey[i];
    return result === 0;
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return randomId('sess');
}
