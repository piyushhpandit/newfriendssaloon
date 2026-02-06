"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { SHOP } from "@/lib/shop";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Toast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";

type WaitlistDetails = {
  waitlist_id: string;
  slot_start_time: string;
  status: string;
  promoted_at: string | null;
  promotion_expires_at: string | null;
  booking_id: string | null;
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

export function WaitlistClient(props: { waitlistId: string | null; token: string | null }) {
  const { waitlistId, token } = props;
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [data, setData] = useState<WaitlistDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  async function loadOnce() {
    setError(null);
    const sb = supabase as SupabaseClient | null;
    if (!sb) {
      setError("App is not ready. Please refresh.");
      setLoading(false);
      return;
    }
    if (!waitlistId || !token) {
      setError("Missing waitlist link details.");
      setLoading(false);
      return;
    }
    const res = await sb.rpc("get_waitlist_for_customer", {
      p_waitlist_id: waitlistId,
      p_customer_token: token,
    });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    const row = (res.data?.[0] ?? null) as WaitlistDetails | null;
    setData(row);
    setLoading(false);
  }

  useEffect(() => {
    const sb = supabase as SupabaseClient | null;
    if (!sb) return;
    void loadOnce();
    const t = window.setInterval(() => {
      void loadOnce();
    }, 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitlistId, token, supabase]);

  async function confirm() {
    const sb = supabase as SupabaseClient | null;
    if (!sb) return;
    if (!waitlistId || !token) return;
    setConfirming(true);
    setError(null);
    const res = await sb.rpc("confirm_promotion", {
      p_waitlist_id: waitlistId,
      p_customer_token: token,
    });
    if (res.error) {
      setError(res.error.message);
      setConfirming(false);
      return;
    }
    const row = (res.data?.[0] ?? null) as { booking_id: string } | null;
    if (row?.booking_id) {
      void fetch("/api/barber/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "booking_confirmed", bookingId: row.booking_id }),
      }).catch(() => null);
      router.push(`/confirm?booking=${row.booking_id}&token=${token}`);
      return;
    }
    setConfirming(false);
    await loadOnce();
  }

  return (
    <div className="min-h-screen px-4 py-5">
      <div className="mx-auto w-full max-w-lg">
        <header className="card">
          <div className="text-sm font-medium text-[rgb(var(--muted))]">Waitlist</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{SHOP.name}</h1>
          <div className="mt-2 text-sm text-[rgb(var(--muted))]">{SHOP.address}</div>
        </header>

        <section className="card mt-4">
          {loading ? <div className="text-sm text-[rgb(var(--muted))]">Loading…</div> : null}
          <Toast message={error} onClose={() => setError(null)} />

          {data ? (
            <div className="space-y-3">
              <div className="panel">
                <div className="flex items-center justify-between">
                  <span className="text-[rgb(var(--muted))]">Slot</span>
                  <span className="font-semibold">{formatDateTime(data.slot_start_time)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[rgb(var(--muted))]">Status</span>
                  <span className="font-semibold">{data.status}</span>
                </div>
              </div>

              {data.status === "PROMOTED" ? (
                <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3 text-sm">
                  <div className="font-semibold">You’re up next</div>
                  <div className="mt-1 text-[rgb(var(--muted))]">
                    Confirm within 5 minutes to lock the slot.
                    {data.promotion_expires_at ? (
                      <div className="mt-1">
                        Expires: <span className="font-medium">{formatDateTime(data.promotion_expires_at)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {data.status === "PROMOTED" ? (
                <button
                  type="button"
                  onClick={confirm}
                  disabled={confirming}
                  className="btn-primary"
                >
                  {confirming ? "Confirming…" : "Confirm slot"}
                </button>
              ) : (
                <div className="text-sm text-[rgb(var(--muted))]">
                  Keep this page open. If a slot opens up, you’ll get 5 minutes to confirm.
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}


