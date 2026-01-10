"use client";

import { useEffect, useMemo, useState } from "react";
import { SHOP } from "@/lib/shop";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { AvailabilityRule, Interval, Slot } from "@/lib/slots";
import { generateSlots } from "@/lib/slots";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

type Service = {
  id: string;
  name: string;
  price_rupees: number;
  duration_minutes: number;
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export default function BookingPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [slots, setSlots] = useState<Slot[]>([]);
  const [nextAvailable, setNextAvailable] = useState<Slot | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedServices = useMemo(
    () => services.filter((s) => selected[s.id]),
    [services, selected],
  );

  const totals = useMemo(() => {
    const totalDuration = selectedServices.reduce((acc, s) => acc + s.duration_minutes, 0);
    const totalPrice = selectedServices.reduce((acc, s) => acc + s.price_rupees, 0);
    return { totalDuration, totalPrice };
  }, [selectedServices]);

  useEffect(() => {
    const sb = supabase as SupabaseClient | null;
    if (!sb) return;
    let alive = true;
    async function load(client: SupabaseClient) {
      setLoading(true);
      setError(null);
      setSelectedSlot(null);

      const today = new Date();
      const dayOfWeek = today.getDay(); // 0..6
      const dayStart = startOfDayLocal(today);
      const dayEnd = endOfDayLocal(today);

      // Minimal "maintenance" call to expire bookings / promotions opportunistically.
      await client.rpc("maintenance_tick");

      const [svcRes, ruleRes, blockedRes, busyRes] = await Promise.all([
        client.from("services").select("id,name,price_rupees,duration_minutes").order("name"),
        client
          .from("availability_rules")
          .select("is_day_off,work_start,work_end,break_start,break_end")
          .eq("day_of_week", dayOfWeek)
          .maybeSingle(),
        client
          .from("blocked_slots")
          .select("start_time,end_time")
          .lt("start_time", dayEnd.toISOString())
          .gt("end_time", dayStart.toISOString()),
        client.rpc("get_busy_intervals", {
          p_start: dayStart.toISOString(),
          p_end: dayEnd.toISOString(),
        }),
      ]);

      if (!alive) return;

      if (svcRes.error) return setError(svcRes.error.message);
      if (ruleRes.error) return setError(ruleRes.error.message);
      if (blockedRes.error) return setError(blockedRes.error.message);
      if (busyRes.error) return setError(busyRes.error.message);

      const svc = (svcRes.data ?? []) as Service[];
      setServices(svc);

      const rule = (ruleRes.data ?? null) as AvailabilityRule | null;
      const blocked: Interval[] = (blockedRes.data ?? []).map((b) => ({
        start: new Date(b.start_time),
        end: new Date(b.end_time),
      }));
      const busy: Interval[] = (busyRes.data ?? []).map((b: { start_time: string; end_time: string }) => ({
        start: new Date(b.start_time),
        end: new Date(b.end_time),
      }));

      const durationMinutes = totals.totalDuration > 0 ? totals.totalDuration : 30;
      const gen = generateSlots({
        day: today,
        rule,
        blocked,
        busy,
        durationMinutes,
      });

      setSlots(gen.slots);
      setNextAvailable(gen.nextAvailable);
      setLoading(false);
    }
    load(sb);
    return () => {
      alive = false;
    };
  }, [supabase, totals.totalDuration]);

  async function book() {
    setError(null);
    const sb = supabase as SupabaseClient | null;
    if (!sb) return setError("App is not ready. Please refresh.");
    if (!selectedSlot) return setError("Select a time slot.");
    if (!name.trim()) return setError("Enter your name.");
    if (!phone.trim()) return setError("Enter your phone number.");
    if (selectedServices.length === 0) return setError("Select at least one service.");

    const res = await sb.rpc("create_booking", {
      p_customer_name: name.trim(),
      p_customer_phone: phone.trim(),
      p_start_time: selectedSlot.start.toISOString(),
      p_service_ids: selectedServices.map((s) => s.id),
    });
    if (res.error) return setError(res.error.message);

    const row = (res.data?.[0] ?? null) as
      | { booking_id: string; customer_token: string; end_time: string }
      | null;
    if (!row) return setError("Booking failed. Please try again.");

    // Best-effort persistence so `/confirm` can recover even if query params are lost on refresh/navigation.
    try {
      localStorage.setItem(
        "nfs_last_booking",
        JSON.stringify({ booking_id: row.booking_id, customer_token: row.customer_token, at: Date.now() }),
      );
      const existingRaw = localStorage.getItem("nfs_booking_tokens");
      const existing = (existingRaw ? JSON.parse(existingRaw) : {}) as Record<string, string>;
      existing[row.booking_id] = row.customer_token;
      localStorage.setItem("nfs_booking_tokens", JSON.stringify(existing));
    } catch {
      // ignore storage failures (private mode, quota, etc.)
    }

    router.push(`/confirm?booking=${row.booking_id}&token=${row.customer_token}`);
  }

  async function joinWaitlist(slotStart: Date) {
    setError(null);
    const sb = supabase as SupabaseClient | null;
    if (!sb) return setError("App is not ready. Please refresh.");
    if (!name.trim()) return setError("Enter your name.");
    if (!phone.trim()) return setError("Enter your phone number.");
    if (selectedServices.length === 0) return setError("Select at least one service.");

    const res = await sb.rpc("join_waitlist", {
      p_slot_start_time: slotStart.toISOString(),
      p_customer_name: name.trim(),
      p_customer_phone: phone.trim(),
      p_service_ids: selectedServices.map((s) => s.id),
    });
    if (res.error) return setError(res.error.message);

    const row = (res.data?.[0] ?? null) as { waitlist_id: string; customer_token: string } | null;
    if (!row) return setError("Could not join waitlist. Please try again.");

    router.push(`/waitlist?waitlist=${row.waitlist_id}&token=${row.customer_token}`);
  }

  return (
    <div className="min-h-screen px-4 py-5">
      <div className="mx-auto w-full max-w-lg">
        {!supabase ? (
          <div className="alert-warning mb-4">
            <div className="font-semibold text-[rgb(var(--warning))]">Setup required</div>
            <div className="mt-1">
              Add <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
              <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> to{" "}
              <span className="font-mono">.env.local</span>, then restart the dev server.
            </div>
          </div>
        ) : null}

        <header className="card">
          <div className="text-sm font-medium text-[rgb(var(--muted))]">Booking</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{SHOP.name}</h1>
          <div className="mt-2 text-sm text-[rgb(var(--muted))]">
            <div>{SHOP.address}</div>
            <div className="mt-1">
              Call:{" "}
              <a className="font-medium underline" href={`tel:${SHOP.phone}`}>
                {SHOP.phone}
              </a>
            </div>
          </div>
        </header>

        <section className="card mt-4">
          <h2 className="text-base font-semibold">Services</h2>
          <div className="mt-3 space-y-2">
            {services.map((s) => (
              <label
                key={s.id}
                className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={!!selected[s.id]}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [s.id]: e.target.checked }))}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-[rgb(var(--muted))]">₹{s.price_rupees}</div>
                  </div>
                  <div className="text-sm text-[rgb(var(--muted))]">{s.duration_minutes} min</div>
                </div>
              </label>
            ))}
            {services.length === 0 && (
              <div className="text-sm text-[rgb(var(--muted))]">No active services yet.</div>
            )}
          </div>

          <div className="input mt-4">
            <div className="flex items-center justify-between">
              <span className="text-[rgb(var(--text))]">Total duration</span>
              <span className="font-medium">{totals.totalDuration || 0} min</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[rgb(var(--muted))]">Total Price</span>
              <span className="font-medium">₹{totals.totalPrice || 0}</span>
            </div>
          </div>
        </section>

        <section className="card mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Today’s availability</h2>
            {nextAvailable ? (
              <div className="text-sm text-[rgb(var(--muted))]">
                Next: <span className="font-semibold">{formatTime(nextAvailable.start)}</span>
              </div>
            ) : (
              <div className="text-sm text-[rgb(var(--muted))]">No slots</div>
            )}
          </div>

          {loading ? (
            <div className="mt-3 text-sm text-[rgb(var(--muted))]">Loading…</div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {slots.map((s) => {
                const selectedThis = selectedSlot?.start.getTime() === s.start.getTime();
                if (s.state === "BLOCKED") {
                  return (
                    <div
                      key={s.start.toISOString()}
                      className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-3 text-center text-sm text-[rgb(var(--placeholder))]"
                    >
                      {formatTime(s.start)}
                    </div>
                  );
                }

                if (s.state === "BOOKED") {
                  return (
                    <button
                      key={s.start.toISOString()}
                      type="button"
                      onClick={() => joinWaitlist(s.start)}
                      className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-3 text-left"
                    >
                      <div className="text-sm font-semibold">{formatTime(s.start)}</div>
                      <div className="mt-0.5 text-xs font-medium text-[rgb(var(--muted))]">
                        Booked · Join waitlist
                      </div>
                    </button>
                  );
                }

                return (
                  <button
                    key={s.start.toISOString()}
                    type="button"
                    onClick={() => setSelectedSlot(s)}
                    className={[
                      "rounded-xl border px-3 py-3 text-left",
                      selectedThis
                        ? "border-[rgb(var(--primary))] bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]"
                        : "border-[rgb(var(--border))] bg-[rgb(var(--card))]",
                    ].join(" ")}
                  >
                    <div className="text-sm font-semibold">{formatTime(s.start)}</div>
                    <div
                      className={
                        selectedThis
                          ? "mt-0.5 text-xs text-[rgb(var(--primary-foreground))]/80"
                          : "mt-0.5 text-xs text-[rgb(var(--muted))]"
                      }
                    >
                      Available
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="card mt-4">
          <h2 className="text-base font-semibold">Your details</h2>
          <div className="mt-3 space-y-3">
            <label className="block">
              <div className="label">Name</div>
              <input
                className="input mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </label>
            <label className="block">
              <div className="label">Phone number</div>
              <input
                className="input mt-1"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="10-digit mobile"
              />
            </label>

            {error ? (
              <div className="alert-danger">{error}</div>
            ) : null}

            <button
              type="button"
              onClick={book}
              className="btn-primary mt-1"
            >
              Book selected time
            </button>

            <div className="text-xs text-[rgb(var(--muted))]">
              Please arrive on time and check in at the shop.
            </div>
        </div>
        </section>

        <footer className="mt-6 pb-6 text-center text-xs text-[rgb(var(--muted))]">
          This booking system was built by a local developer. Want one for your business? Ask inside.
        </footer>
        </div>
    </div>
  );
}
