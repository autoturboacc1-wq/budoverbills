// SHA-256 over the raw bytes of the contract HTML.  The server (in
// `sign_agreement_contract`) recomputes this exact hash and refuses to sign
// the snapshot on mismatch — so client and server MUST hash byte-for-byte
// the same string (no whitespace normalization, no encoding tricks).

export async function computeContractHash(html: string): Promise<string> {
  const bytes = new TextEncoder().encode(html);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}
