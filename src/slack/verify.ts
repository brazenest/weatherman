/**
 * Verifies that a request came from Slack, using the app's signing secret.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */

/** Slack recommends rejecting requests more than five minutes old, to block replays. */
const MAX_AGE_SECONDS = 5 * 60;

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!timestampHeader || !signatureHeader?.startsWith('v0=')) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > MAX_AGE_SECONDS) return false;

  const signature = hexToBytes(signatureHeader.slice(3));
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  // subtle.verify compares in constant time.
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(`v0:${timestampHeader}:${rawBody}`));
}
