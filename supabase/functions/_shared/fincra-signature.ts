/** Verify Fincra's HMAC-SHA512 signature over the JSON-serialized payload. */
export async function verifyFincraSignature(
  payload: unknown,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  const signature = signatureHeader?.trim().toLowerCase() ?? ''
  if (!secret || !/^[0-9a-f]{128}$/.test(signature)) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const serializedPayload = JSON.stringify(payload)
  if (serializedPayload === undefined) return false

  const digest = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(serializedPayload),
  ))
  const expected = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')

  // Compare every character so the result does not reveal the first mismatch.
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return mismatch === 0
}
