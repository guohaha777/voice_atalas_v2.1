// A content fingerprint, never a source name or a cache counter.
export async function audioFingerprint(bytes: ArrayBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
