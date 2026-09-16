// Agent API keys. The plaintext key is shown once and never stored —
// only its sha256 hash goes to the database.

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateAgentKey() {
  const rand = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `myhr_live_${rand}`;
  return { key, hash: await sha256(key), prefix: `myhr_live_${rand.slice(0, 6)}` };
}
