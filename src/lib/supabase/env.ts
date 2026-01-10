export const BARBER_EMAIL = process.env.NEXT_PUBLIC_BARBER_EMAIL ?? "";

export function tryGetSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getSupabaseEnv(): { url: string; anonKey: string } {
  const env = tryGetSupabaseEnv();
  if (!env) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
    }
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return env;
}


