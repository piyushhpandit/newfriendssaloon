"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { BARBER_EMAIL } from "@/lib/supabase/env";
import { SHOP } from "@/lib/shop";
import type { SupabaseClient } from "@supabase/supabase-js";

export default function BarberLoginPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState(BARBER_EMAIL);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendLink() {
    setError(null);
    setLoading(true);
    const sb = supabase as SupabaseClient | null;
    if (!sb) {
      setError("App is not ready. Please refresh.");
      setLoading(false);
      return;
    }
    const e = email.trim();
    if (!e) {
      setError("Enter your email.");
      setLoading(false);
      return;
    }

    const { error: err } = await sb.auth.signInWithOtp({
      email: e,
      options: {
        emailRedirectTo: `${window.location.origin}/barber`,
      },
    });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen px-4 py-5">
      <div className="mx-auto w-full max-w-lg">
        <header className="card">
          <div className="text-sm font-medium text-[rgb(var(--muted))]">Barber access</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{SHOP.name}</h1>
        </header>

        <section className="card mt-4">
          <h2 className="text-base font-semibold">Login (magic link)</h2>
          <div className="mt-3 space-y-3">
            <label className="block">
              <div className="label">Email</div>
              <input
                className="input mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                placeholder="you@domain.com"
              />
            </label>

            {error ? (
              <div className="alert-danger">{error}</div>
            ) : null}

            {sent ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Magic link sent. Open your email on this phone and tap the link.
              </div>
            ) : null}

            <button
              type="button"
              onClick={sendLink}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}


