"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { SHOP } from "@/lib/shop";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Toast } from "@/components/ui/Toast";

type BookingRow = {
  id: string;
  start_time: string;
  end_time: string;
  customer_name: string;
  status: string;
  customer_phone?: string;
  created_at?: string;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(v: string): Date | null {
  // v = YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(y, mo, day, 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function combineDateAndTime(date: Date, time: string): Date | null {
  // time = HH:MM
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "BOOKED":
      return { label: "BOOKED", cls: "bg-amber-50 text-amber-800 border-amber-200" };
    case "CHECKED_IN":
      return { label: "CHECKED IN", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" };
    case "IN_SERVICE":
      return { label: "IN SERVICE", cls: "bg-sky-50 text-sky-800 border-sky-200" };
    case "COMPLETED":
      return { label: "COMPLETED", cls: "bg-zinc-100 text-zinc-700 border-zinc-200" };
    case "EXPIRED":
    case "NO_SHOW":
      return { label: status, cls: "bg-red-50 text-red-800 border-red-200" };
    case "CANCELLED":
      return { label: "CANCELLED", cls: "bg-zinc-50 text-zinc-600 border-zinc-200" };
    case "HOLD":
      return { label: "HOLD", cls: "bg-violet-50 text-violet-800 border-violet-200" };
    default:
      return { label: status, cls: "bg-zinc-50 text-zinc-700 border-zinc-200" };
  }
}

type WaitlistRow = {
  id: string;
  slot_start_time: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  total_duration_minutes: number;
  total_price_rupees: number;
  created_at: string;
  promoted_at: string | null;
  promotion_expires_at: string | null;
  booking_id: string | null;
};

type AvailabilityRuleRow = {
  day_of_week: number;
  is_day_off: boolean;
  work_start: string;
  work_end: string;
  break_start: string | null;
  break_end: string | null;
};

type BlockedSlotRow = {
  id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
};

type ServiceRow = {
  id: string;
  name: string;
  price_rupees: number;
  duration_minutes: number;
  is_active: boolean;
};

const DAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

const DEFAULT_RULES: AvailabilityRuleRow[] = [
  { day_of_week: 0, is_day_off: false, work_start: "10:00", work_end: "20:00", break_start: "14:00", break_end: "15:00" },
  { day_of_week: 1, is_day_off: false, work_start: "10:00", work_end: "20:00", break_start: "14:00", break_end: "15:00" },
  { day_of_week: 2, is_day_off: false, work_start: "10:00", work_end: "20:00", break_start: "14:00", break_end: "15:00" },
  { day_of_week: 3, is_day_off: false, work_start: "10:00", work_end: "20:00", break_start: "14:00", break_end: "15:00" },
  { day_of_week: 4, is_day_off: false, work_start: "10:00", work_end: "20:00", break_start: "14:00", break_end: "15:00" },
  { day_of_week: 5, is_day_off: false, work_start: "10:00", work_end: "20:00", break_start: "14:00", break_end: "15:00" },
  { day_of_week: 6, is_day_off: false, work_start: "10:00", work_end: "20:00", break_start: "14:00", break_end: "15:00" },
];

type TabKey = "bookings" | "queue" | "slots" | "services";

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={
        props.active
          ? "rounded-xl bg-[rgb(var(--primary))] px-3 py-2 text-sm font-semibold text-[rgb(var(--primary-foreground))]"
          : "rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 text-sm font-semibold text-[rgb(var(--text))]"
      }
    >
      {props.children}
    </button>
  );
}

function BarberDashboardInner() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionOk, setSessionOk] = useState<boolean | null>(null);

  const tabFromUrl = (searchParams.get("tab") as TabKey | null) ?? null;
  const tab: TabKey = tabFromUrl && ["bookings", "queue", "slots", "services"].includes(tabFromUrl)
    ? tabFromUrl
    : "bookings";

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Bookings state
  const [bookingMode, setBookingMode] = useState<"today" | "range">("today");
  const [bookingDate, setBookingDate] = useState<string>(toDateInputValue(new Date()));
  const [rangeStart, setRangeStart] = useState<string>(toDateInputValue(new Date()));
  const [rangeEnd, setRangeEnd] = useState<string>(toDateInputValue(new Date()));
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [bookings, setBookings] = useState<BookingRow[]>([]);

  // Queue state
  const [queueDate, setQueueDate] = useState<string>(toDateInputValue(new Date()));
  const [queueOnlyActive, setQueueOnlyActive] = useState<boolean>(true);
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([]);

  // Slots state (weekly + blocks)
  const [rules, setRules] = useState<AvailabilityRuleRow[]>([]);
  const [rulesSaving, setRulesSaving] = useState<boolean>(false);
  const [blocksDate, setBlocksDate] = useState<string>(toDateInputValue(new Date()));
  const [blocked, setBlocked] = useState<BlockedSlotRow[]>([]);
  const [blockStart, setBlockStart] = useState<string>("10:00");
  const [blockEnd, setBlockEnd] = useState<string>("20:00");
  const [blockReason, setBlockReason] = useState<string>("");
  const [blocksSaving, setBlocksSaving] = useState<boolean>(false);

  // Services state
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [serviceSavingId, setServiceSavingId] = useState<string | null>(null);
  const [newService, setNewService] = useState<{ name: string; price: string; duration: string }>({
    name: "",
    price: "",
    duration: "",
  });

  function setTab(next: TabKey) {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("tab", next);
    router.replace(`/barber?${qs.toString()}`);
  }

  async function ensureSession(): Promise<SupabaseClient | null> {
    const sb = supabase as SupabaseClient | null;
    if (!sb) return null;
    const { data: sessionData } = await sb.auth.getSession();
    if (!sessionData.session) return null;
    return sb;
  }

  async function runMaintenance(client: SupabaseClient) {
    await client.rpc("maintenance_tick");
  }

  async function loadBookings(client: SupabaseClient) {
    setLoading(true);
    setError(null);

    await runMaintenance(client);

    let start: Date | null = null;
    let end: Date | null = null;

    if (bookingMode === "today") {
      const d = fromDateInputValue(bookingDate) ?? new Date();
      start = startOfDayLocal(d);
      end = endOfDayLocal(d);
    } else {
      const s = fromDateInputValue(rangeStart);
      const e = fromDateInputValue(rangeEnd);
      if (s && e) {
        start = startOfDayLocal(s);
        end = endOfDayLocal(e);
      }
    }

    if (!start || !end) {
      setError("Pick a valid date range.");
      setLoading(false);
      return;
    }

    let q = client
      .from("bookings")
      .select("id,start_time,end_time,customer_name,customer_phone,status,created_at")
      .gte("start_time", start.toISOString())
      .lt("start_time", end.toISOString())
      .order("start_time", { ascending: true });

    if (statusFilter !== "ALL") {
      q = q.eq("status", statusFilter);
    }

    const res = await q;
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }

    const raw = (res.data ?? []) as BookingRow[];
    const s = search.trim().toLowerCase();
    const filtered =
      s.length === 0
        ? raw
        : raw.filter((b) => {
            const name = (b.customer_name ?? "").toLowerCase();
            const phone = (b.customer_phone ?? "").toLowerCase();
            return name.includes(s) || phone.includes(s);
          });

    setBookings(filtered);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const sb = await ensureSession();
      if (!sb) {
        setSessionOk(false);
        setLoading(false);
        return;
      }
      setSessionOk(true);
      // Initial load based on tab
      if (tab === "bookings") await loadBookings(sb);
      else if (tab === "queue") await loadQueue(sb);
      else if (tab === "slots") {
        await Promise.all([loadRules(sb), loadBlocks(sb)]);
      } else if (tab === "services") await loadServices(sb);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function updateStatus(id: string, status: string) {
    setError(null);
    const sb = supabase as SupabaseClient | null;
    if (!sb) return;
    const res = await sb.from("bookings").update({ status }).eq("id", id).select("start_time").maybeSingle();
    if (res.error) {
      setError(res.error.message);
      return;
    }

    // If a future booking is cancelled/no-show, try to promote the waitlist automatically for that slot.
    // (The RPC is idempotent and will no-op if slot isn't free or nobody is waiting.)
    if ((status === "CANCELLED" || status === "NO_SHOW") && res.data?.start_time) {
      const startMs = new Date(res.data.start_time).getTime();
      if (Number.isFinite(startMs) && startMs > Date.now()) {
        await sb.rpc("promote_waitlist_for_slot", { p_slot_start_time: res.data.start_time });
      }
    }

    const ok = await ensureSession();
    if (ok) await loadBookings(ok);
  }

  async function signOut() {
    const sb = supabase as SupabaseClient | null;
    if (!sb) return;
    await sb.auth.signOut();
    router.push("/barber/login");
  }

  async function loadQueue(client: SupabaseClient) {
    setLoading(true);
    setError(null);
    await runMaintenance(client);

    const d = fromDateInputValue(queueDate) ?? new Date();
    const dayStart = startOfDayLocal(d);
    const dayEnd = endOfDayLocal(d);

    let q = client
      .from("waitlist")
      .select(
        "id,slot_start_time,customer_name,customer_phone,status,total_duration_minutes,total_price_rupees,created_at,promoted_at,promotion_expires_at,booking_id",
      )
      .gte("slot_start_time", dayStart.toISOString())
      .lt("slot_start_time", dayEnd.toISOString())
      .order("slot_start_time", { ascending: true })
      .order("created_at", { ascending: true });

    if (queueOnlyActive) {
      q = q.in("status", ["WAITING", "PROMOTED"]);
    }

    const res = await q;
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setWaitlist((res.data ?? []) as WaitlistRow[]);
    setLoading(false);
  }

  async function promoteSlot(client: SupabaseClient, slotStartIso: string) {
    setError(null);
    const res = await client.rpc("promote_waitlist_for_slot", { p_slot_start_time: slotStartIso });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    await loadQueue(client);
    // Also refresh bookings to show HOLD booking if created
    await loadBookings(client);
  }

  async function cancelWaitlistEntry(client: SupabaseClient, id: string) {
    setError(null);
    const res = await client.from("waitlist").update({ status: "CANCELLED" }).eq("id", id);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    await loadQueue(client);
  }

  async function loadRules(client: SupabaseClient) {
    setLoading(true);
    setError(null);
    const res = await client
      .from("availability_rules")
      .select("day_of_week,is_day_off,work_start,work_end,break_start,break_end")
      .order("day_of_week", { ascending: true });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setRules((res.data ?? []) as AvailabilityRuleRow[]);
    setLoading(false);
  }

  async function initializeDefaultRules(client: SupabaseClient) {
    setError(null);
    setRulesSaving(true);
    const payload = DEFAULT_RULES.map((r) => ({
      day_of_week: r.day_of_week,
      is_day_off: r.is_day_off,
      work_start: r.work_start,
      work_end: r.work_end,
      break_start: r.break_start,
      break_end: r.break_end,
    }));
    const res = await client.from("availability_rules").upsert(payload, { onConflict: "day_of_week" });
    if (res.error) {
      setError(res.error.message);
      setRulesSaving(false);
      return;
    }
    setRulesSaving(false);
    await loadRules(client);
  }

  async function saveRules(client: SupabaseClient) {
    setError(null);
    setRulesSaving(true);
    if (rules.length === 0) {
      setError("No schedule rows found. Click “Initialize default schedule” first.");
      setRulesSaving(false);
      return;
    }
    const payload = rules.map((r) => ({
      day_of_week: r.day_of_week,
      is_day_off: r.is_day_off,
      work_start: r.work_start,
      work_end: r.work_end,
      break_start: r.break_start,
      break_end: r.break_end,
    }));
    const res = await client.from("availability_rules").upsert(payload, { onConflict: "day_of_week" });
    if (res.error) {
      setError(res.error.message);
      setRulesSaving(false);
      return;
    }
    setRulesSaving(false);
    await loadRules(client);
  }

  async function loadBlocks(client: SupabaseClient) {
    setLoading(true);
    setError(null);
    const d = fromDateInputValue(blocksDate) ?? new Date();
    const dayStart = startOfDayLocal(d);
    const dayEnd = endOfDayLocal(d);

    const res = await client
      .from("blocked_slots")
      .select("id,start_time,end_time,reason")
      .lt("start_time", dayEnd.toISOString())
      .gt("end_time", dayStart.toISOString())
      .order("start_time", { ascending: true });

    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setBlocked((res.data ?? []) as BlockedSlotRow[]);
    setLoading(false);
  }

  async function addBlock(client: SupabaseClient) {
    setError(null);
    setBlocksSaving(true);
    const d = fromDateInputValue(blocksDate) ?? new Date();
    const start = combineDateAndTime(d, blockStart);
    const end = combineDateAndTime(d, blockEnd);
    if (!start || !end || start >= end) {
      setError("Choose a valid block start/end time.");
      setBlocksSaving(false);
      return;
    }

    const res = await client.from("blocked_slots").insert({
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      reason: blockReason.trim() || null,
    });
    if (res.error) {
      setError(res.error.message);
      setBlocksSaving(false);
      return;
    }
    setBlocksSaving(false);
    await loadBlocks(client);
  }

  async function deleteBlock(client: SupabaseClient, id: string) {
    setError(null);
    const res = await client.from("blocked_slots").delete().eq("id", id);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    await loadBlocks(client);
  }

  async function closeToday(client: SupabaseClient) {
    setError(null);
    setBlocksSaving(true);
    const d = new Date();
    const day = d.getDay();
    const rule = rules.find((r) => r.day_of_week === day) ?? null;
    const dayStart = startOfDayLocal(d);

    const workStart = rule?.work_start?.slice(0, 5) ?? "10:00";
    const workEnd = rule?.work_end?.slice(0, 5) ?? "20:00";
    const start = combineDateAndTime(dayStart, workStart);
    const end = combineDateAndTime(dayStart, workEnd);
    if (!start || !end || start >= end) {
      setError("Could not compute today’s work hours. Check availability rules.");
      setBlocksSaving(false);
      return;
    }

    const res = await client.from("blocked_slots").insert({
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      reason: "CLOSED_TODAY",
    });
    if (res.error) {
      setError(res.error.message);
      setBlocksSaving(false);
      return;
    }
    setBlocksSaving(false);
    // Also update the blocks tab date to today so the barber sees the change instantly
    setBlocksDate(toDateInputValue(new Date()));
    await loadBlocks(client);
  }

  async function openToday(client: SupabaseClient) {
    setError(null);
    setBlocksSaving(true);
    const d = new Date();
    const dayStart = startOfDayLocal(d);
    const dayEnd = endOfDayLocal(d);

    // Remove only the blocks we created via the quick button
    const res = await client
      .from("blocked_slots")
      .delete()
      .eq("reason", "CLOSED_TODAY")
      .gte("start_time", dayStart.toISOString())
      .lt("start_time", dayEnd.toISOString());

    if (res.error) {
      setError(res.error.message);
      setBlocksSaving(false);
      return;
    }
    setBlocksSaving(false);
    setBlocksDate(toDateInputValue(new Date()));
    await loadBlocks(client);
  }

  async function loadServices(client: SupabaseClient) {
    setLoading(true);
    setError(null);
    const res = await client
      .from("services")
      .select("id,name,price_rupees,duration_minutes,is_active")
      .order("name", { ascending: true });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setServices((res.data ?? []) as ServiceRow[]);
    setLoading(false);
  }

  async function toggleService(client: SupabaseClient, svc: ServiceRow) {
    setError(null);
    setServiceSavingId(svc.id);
    const res = await client.from("services").update({ is_active: !svc.is_active }).eq("id", svc.id);
    if (res.error) {
      setError(res.error.message);
      setServiceSavingId(null);
      return;
    }
    setServiceSavingId(null);
    await loadServices(client);
  }

  async function addService(client: SupabaseClient) {
    setError(null);
    const name = newService.name.trim();
    const price = Number(newService.price);
    const duration = Number(newService.duration);
    if (!name) return setError("Service name is required.");
    if (!Number.isFinite(price) || price < 0) return setError("Enter a valid price.");
    if (!Number.isFinite(duration) || duration <= 0) return setError("Enter a valid duration (minutes).");

    setServiceSavingId("NEW");
    const res = await client.from("services").insert({
      name,
      price_rupees: price,
      duration_minutes: duration,
      is_active: true,
    });
    if (res.error) {
      setError(res.error.message);
      setServiceSavingId(null);
      return;
    }
    setNewService({ name: "", price: "", duration: "" });
    setServiceSavingId(null);
    await loadServices(client);
  }

  if (sessionOk === false) {
    router.replace("/barber/login");
    return null;
  }

  return (
    <div className="min-h-screen px-4 py-5">
      <div className="mx-auto w-full max-w-lg">
        <header className="card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-[rgb(var(--muted))]">Barber Dashboard</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{SHOP.name}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")}>
                  Bookings
                </TabButton>
                <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
                  Queue
                </TabButton>
                <TabButton active={tab === "slots"} onClick={() => setTab("slots")}>
                  Slots
                </TabButton>
                <TabButton active={tab === "services"} onClick={() => setTab("services")}>
                  Services
                </TabButton>
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="btn-secondary"
            >
              Sign out
            </button>
          </div>
        </header>

        <section className="card mt-4">
          <Toast message={error} onClose={() => setError(null)} />

          {loading ? <div className="text-sm text-[rgb(var(--muted))]">Loading…</div> : null}

          {tab === "bookings" ? (
            <div className="space-y-4">
              <div className="panel space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBookingMode("today")}
                    className={
                      bookingMode === "today"
                        ? "rounded-xl bg-white px-3 py-2 text-sm font-semibold"
                        : "rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold"
                    }
                  >
                    By day
                  </button>
                  <button
                    type="button"
                    onClick={() => setBookingMode("range")}
                    className={
                      bookingMode === "range"
                        ? "rounded-xl bg-white px-3 py-2 text-sm font-semibold"
                        : "rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold"
                    }
                  >
                    Date range
                  </button>
                </div>

                {bookingMode === "today" ? (
                  <label className="block">
                    <div className="text-white">Date</div>
                    <input className="input mt-1" type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
                  </label>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <div className="text-white">From</div>
                      <input className="input mt-1" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                    </label>
                    <label className="block">
                      <div className="text-white">To</div>
                      <input className="input mt-1" type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                    </label>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <div className="text-white">Status</div>
                    <select className="input mt-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="ALL">All</option>
                      <option value="BOOKED">BOOKED</option>
                      <option value="CHECKED_IN">CHECKED_IN</option>
                      <option value="IN_SERVICE">IN_SERVICE</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="HOLD">HOLD</option>
                      <option value="CANCELLED">CANCELLED</option>
                      <option value="EXPIRED">EXPIRED</option>
                      <option value="NO_SHOW">NO_SHOW</option>
                    </select>
                  </label>
                  <label className="block">
                    <div className="text-white">Search (name/phone)</div>
                    <input className="input mt-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Rahul / 98..." />
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={async () => {
                      const sb = await ensureSession();
                      if (!sb) return setSessionOk(false);
                      await loadBookings(sb);
                    }}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={async () => {
                      const sb = await ensureSession();
                      if (!sb) return setSessionOk(false);
                      await runMaintenance(sb);
                      await loadBookings(sb);
                    }}
                  >
                    Run maintenance
                  </button>
                </div>
              </div>

              {!loading && bookings.length === 0 ? (
                <div className="text-sm text-[rgb(var(--muted))]">No bookings found.</div>
              ) : null}

              <div className="space-y-3">
                {bookings.map((b) => {
                  const badge = statusBadge(b.status);
                  return (
                    <div key={b.id} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold">
                            {formatTime(b.start_time)}–{formatTime(b.end_time)}
                          </div>
                          <div className="text-sm text-[rgb(var(--text))]">{b.customer_name}</div>
                          {b.customer_phone ? (
                            <div className="text-xs text-[rgb(var(--muted))]">{b.customer_phone}</div>
                          ) : null}
                        </div>
                        <div className={`rounded-full border px-2 py-1 text-xs font-semibold ${badge.cls}`}>{badge.label}</div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => updateStatus(b.id, "CHECKED_IN")} className="btn-secondary">
                          Check in
                        </button>
                        <button type="button" onClick={() => updateStatus(b.id, "IN_SERVICE")} className="btn-secondary">
                          Start service
                        </button>
                        <button type="button" onClick={() => updateStatus(b.id, "COMPLETED")} className="btn-secondary">
                          Completed
                        </button>
                        <button type="button" onClick={() => updateStatus(b.id, "NO_SHOW")} className="btn-secondary">
                          No show
                        </button>
                        <button type="button" onClick={() => updateStatus(b.id, "CANCELLED")} className="btn-secondary col-span-2">
                          Cancel booking
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {tab === "queue" ? (
            <div className="space-y-4">
              <div className="panel space-y-3">
                <label className="block">
                  <div className="text-white">Date</div>
                  <input className="input mt-1" type="date" value={queueDate} onChange={(e) => setQueueDate(e.target.value)} />
                </label>

                <label className=" text-white flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={queueOnlyActive} onChange={(e) => setQueueOnlyActive(e.target.checked)} />
                  Show only active (WAITING / PROMOTED)
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={async () => {
                      const sb = await ensureSession();
                      if (!sb) return setSessionOk(false);
                      await loadQueue(sb);
                    }}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={async () => {
                      const sb = await ensureSession();
                      if (!sb) return setSessionOk(false);
                      await runMaintenance(sb);
                      await loadQueue(sb);
                    }}
                  >
                    Run maintenance
                  </button>
                </div>
              </div>

              {!loading && waitlist.length === 0 ? (
                <div className="text-sm text-[rgb(var(--muted))]">No waitlist entries.</div>
              ) : null}

              <div className="space-y-3">
                {Object.entries(
                  waitlist.reduce<Record<string, WaitlistRow[]>>((acc, row) => {
                    acc[row.slot_start_time] = acc[row.slot_start_time] ?? [];
                    acc[row.slot_start_time].push(row);
                    return acc;
                  }, {}),
                ).map(([slotIso, items]) => {
                  return (
                    <div key={slotIso} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm text-[rgb(var(--muted))]">Slot</div>
                          <div className="text-lg font-semibold">{new Date(slotIso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</div>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={async () => {
                            const sb = await ensureSession();
                            if (!sb) return setSessionOk(false);
                            await promoteSlot(sb, slotIso);
                          }}
                        >
                          Promote next
                        </button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {items.map((w) => (
                          <div key={w.id} className="rounded-xl border border-[rgb(var(--border))] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold">{w.customer_name}</div>
                                <div className="text-xs text-[rgb(var(--muted))]">{w.customer_phone}</div>
                                <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                                  {w.total_duration_minutes} min · ₹{w.total_price_rupees}
                                </div>
                                <div className="mt-1 text-xs text-[rgb(var(--muted))]">Status: {w.status}</div>
                                {w.promotion_expires_at ? (
                                  <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                                    Expires: {new Date(w.promotion_expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={async () => {
                                    const sb = await ensureSession();
                                    if (!sb) return setSessionOk(false);
                                    await cancelWaitlistEntry(sb, w.id);
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {tab === "slots" ? (
            <div className="space-y-4">
              <div className="panel space-y-3">
                <div className="text-sm text-white font-semibold">Quick actions</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={blocksSaving}
                    onClick={async () => {
                      const sb = await ensureSession();
                      if (!sb) return setSessionOk(false);
                      await closeToday(sb);
                    }}
                  >
                    {blocksSaving ? "Working…" : "Close today"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={blocksSaving}
                    onClick={async () => {
                      const sb = await ensureSession();
                      if (!sb) return setSessionOk(false);
                      await openToday(sb);
                    }}
                  >
                    {blocksSaving ? "Working…" : "Open today"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Weekly schedule</div>
                    <div className="text-xs text-[rgb(var(--muted))]">This controls which slots can be generated.</div>
                  </div>
                  <div className="flex gap-2">
                    {rules.length === 0 ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={rulesSaving}
                        onClick={async () => {
                          const sb = await ensureSession();
                          if (!sb) return setSessionOk(false);
                          await initializeDefaultRules(sb);
                        }}
                      >
                        {rulesSaving ? "Working…" : "Initialize default schedule"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={rulesSaving}
                      onClick={async () => {
                        const sb = await ensureSession();
                        if (!sb) return setSessionOk(false);
                        await saveRules(sb);
                      }}
                    >
                      {rulesSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>

                {rules.length === 0 ? (
                  <div className="alert-warning mt-3">
                    No weekly schedule found in the database. Slots cannot be generated until you initialize the schedule.
                  </div>
                ) : null}

                <div className="mt-3 space-y-2">
                  {rules.map((r) => (
                    <div key={r.day_of_week} className="rounded-xl border border-[rgb(var(--border))] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">{DAY_LABELS[r.day_of_week] ?? r.day_of_week}</div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={r.is_day_off}
                            onChange={(e) =>
                              setRules((prev) =>
                                prev.map((x) => (x.day_of_week === r.day_of_week ? { ...x, is_day_off: e.target.checked } : x)),
                              )
                            }
                          />
                          Day off
                        </label>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="block">
                          <div className="label">Work start</div>
                          <input
                            className="input mt-1"
                            type="time"
                            value={r.work_start.slice(0, 5)}
                            onChange={(e) =>
                              setRules((prev) =>
                                prev.map((x) => (x.day_of_week === r.day_of_week ? { ...x, work_start: e.target.value } : x)),
                              )
                            }
                          />
                        </label>
                        <label className="block">
                          <div className="label">Work end</div>
                          <input
                            className="input mt-1"
                            type="time"
                            value={r.work_end.slice(0, 5)}
                            onChange={(e) =>
                              setRules((prev) =>
                                prev.map((x) => (x.day_of_week === r.day_of_week ? { ...x, work_end: e.target.value } : x)),
                              )
                            }
                          />
                        </label>
                        <label className="block">
                          <div className="label">Break start</div>
                          <input
                            className="input mt-1"
                            type="time"
                            value={(r.break_start ?? "").slice(0, 5)}
                            onChange={(e) =>
                              setRules((prev) =>
                                prev.map((x) =>
                                  x.day_of_week === r.day_of_week ? { ...x, break_start: e.target.value || null } : x,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="block">
                          <div className="label">Break end</div>
                          <input
                            className="input mt-1"
                            type="time"
                            value={(r.break_end ?? "").slice(0, 5)}
                            onChange={(e) =>
                              setRules((prev) =>
                                prev.map((x) =>
                                  x.day_of_week === r.day_of_week ? { ...x, break_end: e.target.value || null } : x,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Blocked slots</div>
                    <div className="text-xs text-[rgb(var(--muted))]">Use this to disable slots for a specific time range.</div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={async () => {
                      const sb = await ensureSession();
                      if (!sb) return setSessionOk(false);
                      await loadBlocks(sb);
                    }}
                  >
                    Refresh
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  <label className="block">
                    <div className="label">Date</div>
                    <input
                      className="input mt-1"
                      type="date"
                      value={blocksDate}
                      onChange={async (e) => {
                        setBlocksDate(e.target.value);
                        const sb = await ensureSession();
                        if (!sb) return setSessionOk(false);
                        // Load after date changes
                        setTimeout(() => loadBlocks(sb), 0);
                      }}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <div className="label">Start</div>
                      <input className="input mt-1" type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
                    </label>
                    <label className="block">
                      <div className="label">End</div>
                      <input className="input mt-1" type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
                    </label>
                  </div>

                  <label className="block">
                    <div className="label">Reason (optional)</div>
                    <input
                      className="input mt-1"
                      value={blockReason}
                      onChange={(e) => setBlockReason(e.target.value)}
                      placeholder="e.g. Lunch / Personal / CLOSED_TODAY"
                    />
                  </label>

                  <button
                    type="button"
                    className="btn-primary"
                    disabled={blocksSaving}
                    onClick={async () => {
                      const sb = await ensureSession();
                      if (!sb) return setSessionOk(false);
                      await addBlock(sb);
                    }}
                  >
                    {blocksSaving ? "Saving…" : "Add block (disable slots)"}
                  </button>

                  <div className="space-y-2">
                    {blocked.map((b) => (
                      <div key={b.id} className="flex items-start justify-between gap-3 rounded-xl border border-[rgb(var(--border))] p-3">
                        <div>
                          <div className="font-semibold">
                            {formatTime(b.start_time)}–{formatTime(b.end_time)}
                          </div>
                          {b.reason ? <div className="text-xs text-[rgb(var(--muted))]">{b.reason}</div> : null}
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={async () => {
                            const sb = await ensureSession();
                            if (!sb) return setSessionOk(false);
                            await deleteBlock(sb, b.id);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {!loading && blocked.length === 0 ? (
                      <div className="text-sm text-[rgb(var(--muted))]">No blocks for this date.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "services" ? (
            <div className="space-y-4">
              <div className="panel space-y-3">
                <div className="text-sm text-white font-semibold">Add service</div>
                <label className="block">
                  <div className="text-white">Name</div>
                  <input className="input mt-1" value={newService.name} onChange={(e) => setNewService((p) => ({ ...p, name: e.target.value }))} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <div className="text-white">Price (₹)</div>
                    <input
                      className="input mt-1"
                      inputMode="numeric"
                      value={newService.price}
                      onChange={(e) => setNewService((p) => ({ ...p, price: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <div className="text-white">Duration (min)</div>
                    <input
                      className="input mt-1"
                      inputMode="numeric"
                      value={newService.duration}
                      onChange={(e) => setNewService((p) => ({ ...p, duration: e.target.value }))}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={serviceSavingId === "NEW"}
                  onClick={async () => {
                    const sb = await ensureSession();
                    if (!sb) return setSessionOk(false);
                    await addService(sb);
                  }}
                >
                  {serviceSavingId === "NEW" ? "Adding…" : "Add service"}
                </button>
              </div>

              <div className="space-y-2">
                {services.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-[rgb(var(--muted))]">
                          ₹{s.price_rupees} · {s.duration_minutes} min
                        </div>
                        <div className="mt-1 text-xs text-[rgb(var(--muted))]">Active: {s.is_active ? "Yes" : "No"}</div>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={serviceSavingId === s.id}
                        onClick={async () => {
                          const sb = await ensureSession();
                          if (!sb) return setSessionOk(false);
                          await toggleService(sb, s);
                        }}
                      >
                        {serviceSavingId === s.id ? "Saving…" : s.is_active ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </div>
                ))}
                {!loading && services.length === 0 ? (
                  <div className="text-sm text-[rgb(var(--muted))]">No services yet.</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default function BarberDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen px-4 py-5">
          <div className="mx-auto w-full max-w-lg">
            <div className="card">
              <div className="text-sm font-medium text-[rgb(var(--muted))]">Barber Dashboard</div>
              <div className="mt-2 text-sm text-[rgb(var(--muted))]">Loading…</div>
            </div>
          </div>
        </div>
      }
    >
      <BarberDashboardInner />
    </Suspense>
  );
}


