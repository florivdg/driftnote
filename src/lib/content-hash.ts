// FNV-1a 64-bit content hash of an embedded note body, hex-encoded. Cheap,
// stable, and dependency-free — its only job is to detect that a body changed
// since the vector was computed, so collision resistance isn't a concern.
//
// Lives in its own module (no db/schema imports) so the client EmbeddingIndexer
// can hash a body the SAME way the server does. The server compares the stored
// hash against a fresh hash to decide staleness, so both sides MUST agree.
export function contentHash(body: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < body.length; i++) {
    hash = (hash ^ BigInt(body.charCodeAt(i))) & mask;
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}
