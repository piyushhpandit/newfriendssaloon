import { createClient } from "@supabase/supabase-js";
import { tryGetSupabaseEnv } from "./env";

export function supabaseBrowser() {
  const env = tryGetSupabaseEnv();
  if (!env) return null;
  const { url, anonKey } = env;
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}


