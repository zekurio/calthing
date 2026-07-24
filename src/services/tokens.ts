/**
 * Per-user calendar feed tokens: `<userId>.<base64url HMAC-SHA256(secret, userId)>`.
 *
 * Calendar clients cannot log in, so the feed URL carries a signed token that
 * grants access to /calendar.ics only. Tokens are deterministic per user and
 * server secret — rotating the secret invalidates every feed URL at once.
 */

const encoder = new TextEncoder()

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const raw = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
    const bytes = new Uint8Array(raw.length)
    for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

export async function signFeedToken(secret: string, userId: string): Promise<string> {
  const key = await hmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(userId))
  return `${userId}.${base64url(signature)}`
}

/** Returns the embedded user id when the signature checks out, null otherwise. */
export async function verifyFeedToken(secret: string, token: string): Promise<string | null> {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const userId = token.slice(0, dot)
  const signature = fromBase64url(token.slice(dot + 1))
  if (signature === null || signature.length !== 32) return null
  const key = await hmacKey(secret)
  // crypto.subtle.verify compares in constant time
  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(userId))
  return valid ? userId : null
}
