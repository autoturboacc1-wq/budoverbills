// SHA-256 hash of the canonical contract HTML.  Used to anchor each
// signature to the exact text the signer saw, so any post-hoc edit
// is detectable when the contract is presented as evidence.

function normalize(html: string): string {
  // Collapse whitespace so cosmetic re-renders don't change the hash.
  return html.replace(/\s+/g, " ").trim();
}

export async function computeContractHash(html: string): Promise<string> {
  const normalized = normalize(html);
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}
