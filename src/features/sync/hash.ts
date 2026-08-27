/**
 * Returns the canonical SHA-256 representation used by the API contract.
 *
 * Older local manifests may contain the optional `sha256:` prefix, so
 * comparisons at the client boundary must normalize both representations.
 */
export function normalizeContentHash(value: string | null | undefined): string {
  return (value || "").trim().replace(/^sha256:/i, "").toLowerCase();
}

/** Computes the canonical lowercase SHA-256 digest for a UTF-8 string. */
export async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
