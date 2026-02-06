"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { BARBER_EMAIL } from "@/lib/supabase/env";
import { SHOP } from "@/lib/shop";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Toast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";

export default function BarberLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState(BARBER_EMAIL);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode() {
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

    // Email OTP (code) flow. This sends a one-time code to the email address.
    const { error: err } = await sb.auth.signInWithOtp({ email: e, options: { shouldCreateUser: false } });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  async function verifyCode() {
    setError(null);
    setLoading(true);
    const sb = supabase as SupabaseClient | null;
    if (!sb) {
      setError("App is not ready. Please refresh.");
      setLoading(false);
      return;
    }
    const e = email.trim();
    const t = code.trim().replace(/\s+/g, "");
    if (!e) {
      setError("Enter your email.");
      setLoading(false);
      return;
    }
    if (!t) {
      setError("Enter the code from your email.");
      setLoading(false);
      return;
    }
    const { error: err } = await sb.auth.verifyOtp({ email: e, token: t, type: "email" });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    router.push("/barber");
  }

  return (
    <div className="min-h-screen px-4 py-5">
      <div className="mx-auto w-full max-w-lg">
        <header className="card">
          <div className="text-sm font-medium text-[rgb(var(--muted))]">Barber access</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{SHOP.name}</h1>
        </header>

        <section className="card mt-4">
          <h2 className="text-base font-semibold">Login (email code)</h2>
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

            {sent ? (
              <label className="block">
                <div className="label">Code</div>
                <input
                  className="input mt-1"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  placeholder="Enter the code"
                />
              </label>
            ) : null}

            <Toast message={error} onClose={() => setError(null)} />

            <button
              type="button"
              onClick={sendCode}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? "Sending…" : "Send code"}
            </button>

            {sent ? (
              <button type="button" onClick={verifyCode} disabled={loading} className="btn-primary">
                {loading ? "Verifying…" : "Verify code"}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}


