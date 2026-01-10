"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { SHOP } from "@/lib/shop";
import type { SupabaseClient } from "@supabase/supabase-js";

type BookingDetails = {
  booking_id: string;
  customer_name: string;
  customer_phone: string;
  start_time: string;
  end_time: string;
  status: string;
  grace_expiry_time: string;
  services: Array<{ name: string; price_rupees: number; duration_minutes: number }>;
  total_duration_minutes: number;
  total_price_rupees: number;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ConfirmClient(props: { bookingId: string | null; token: string | null }) {
  const [bookingId, setBookingId] = useState<string | null>(props.bookingId);
  const [token, setToken] = useState<string | null>(props.token);
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [data, setData] = useState<BookingDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);

  // Recover missing query params on the client (some environments can lose server-provided searchParams).
  useEffect(() => {
    if (bookingId && token) return;
    try {
      const qs = new URLSearchParams(window.location.search);
      const b = qs.get("booking");
      const t = qs.get("token");
      if (b && t) {
        setBookingId(b);
        setToken(t);
        return;
      }
      // Fallback: use last booking from storage
      const lastRaw = localStorage.getItem("nfs_last_booking");
      const last = lastRaw ? (JSON.parse(lastRaw) as { booking_id?: string; customer_token?: string }) : null;
      if (last?.booking_id && last?.customer_token) {
        setBookingId(last.booking_id);
        setToken(last.customer_token);
        return;
      }
      // Fallback: if we have booking but missing token, look up token map
      if (b && !t) {
        const mapRaw = localStorage.getItem("nfs_booking_tokens");
        const map = mapRaw ? (JSON.parse(mapRaw) as Record<string, string>) : null;
        const mapped = map?.[b] ?? null;
        if (mapped) {
          setBookingId(b);
          setToken(mapped);
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sb = supabase as SupabaseClient | null;
    if (!sb) return;
    let alive = true;
    async function load(client: SupabaseClient) {
      setLoading(true);
      setError(null);

      if (!bookingId || !token) {
        setError("Missing booking link details. Please open the confirmation link from booking (it should include booking + token).");
        setLoading(false);
        return;
      }

      const res = await client.rpc("get_booking_for_customer", {
        p_booking_id: bookingId,
        p_customer_token: token,
      });

      if (!alive) return;
      if (res.error) {
        setError(res.error.message);
        setLoading(false);
        return;
      }

      const row = (res.data?.[0] ?? null) as BookingDetails | null;
      setData(row);
      setLoading(false);
    }
    load(sb);
    return () => {
      alive = false;
    };
  }, [bookingId, token, supabase]);

  async function checkIn() {
    const sb = supabase as SupabaseClient | null;
    if (!sb) return;
    if (!bookingId || !token) return;
    setCheckingIn(true);
    setError(null);
    const res = await sb.rpc("customer_check_in", {
      p_booking_id: bookingId,
      p_customer_token: token,
    });
    if (res.error) {
      setError(res.error.message);
      setCheckingIn(false);
      return;
    }
    // Reload details (status should change)
    const again = await sb.rpc("get_booking_for_customer", {
      p_booking_id: bookingId,
      p_customer_token: token,
    });
    const row = (again.data?.[0] ?? null) as BookingDetails | null;
    setData(row);
    setCheckingIn(false);
  }

  return (
    <div className="min-h-screen px-4 py-5">
      <div className="mx-auto w-full max-w-lg">
        <header className="card">
          <div className="text-sm font-medium text-[rgb(var(--muted))]">Confirmation</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{SHOP.name}</h1>
          <div className="mt-2 text-sm text-[rgb(var(--muted))]">{SHOP.address}</div>
        </header>

        <section className="card mt-4">
          {loading ? <div className="text-sm text-[rgb(var(--muted))]">Loading…</div> : null}
          {error ? (
            <div className="alert-danger">{error}</div>
          ) : null}
          {data ? (
            <div className="space-y-3">
              <div className="panel">
                <div className="flex items-center justify-between">
                  <span className="text-[rgb(var(--muted))]">Date & time</span>
                  <span className="font-semibold">{formatDateTime(data.start_time)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[rgb(var(--muted))]">Duration</span>
                  <span className="font-semibold">{data.total_duration_minutes} min</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[rgb(var(--muted))]">Total</span>
                  <span className="font-semibold">₹{data.total_price_rupees}</span>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold">Selected services</div>
                <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                  {data.services.map((s, idx) => (
                    <li key={idx} className="flex items-center justify-between">
                      <span>{s.name}</span>
                      <span className="text-[rgb(var(--muted))]">
                        {s.duration_minutes} min · ₹{s.price_rupees}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[rgb(var(--muted))]">Status</span>
                  <span className="font-semibold">{data.status}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={checkIn}
                disabled={checkingIn}
                className="btn-primary"
              >
                {checkingIn ? "Checking in…" : "I’ve arrived"}
              </button>

              <div className="text-xs text-[rgb(var(--muted))]">
                Please arrive on time and check in at the shop.
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}


