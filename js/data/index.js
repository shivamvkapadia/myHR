import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";
import { createLocalAdapter } from "./local.js";

export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export async function createBackend() {
  if (!isSupabaseConfigured()) return createLocalAdapter();
  const { createSupabaseAdapter } = await import("./supabase.js");
  return createSupabaseAdapter(SUPABASE_URL, SUPABASE_ANON_KEY);
}
