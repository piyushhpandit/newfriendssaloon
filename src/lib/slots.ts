import { SHOP } from "@/lib/shop";

export type AvailabilityRule = {
  is_day_off: boolean;
  work_start: string; // "HH:MM:SS"
  work_end: string; // "HH:MM:SS"
  break_start: string | null; // "HH:MM:SS"
  break_end: string | null; // "HH:MM:SS"
};

export type Interval = { start: Date; end: Date };

export type Slot = {
  start: Date;
  end: Date;
  state: "AVAILABLE" | "BOOKED" | "BLOCKED";
};

function parseTimeToDate(day: Date, time: string): Date {
  const [hh, mm] = time.split(":").map((v) => Number(v));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm, 0, 0);
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function generateSlots(opts: {
  day: Date;
  rule: AvailabilityRule | null;
  blocked: Interval[];
  busy: Interval[];
  durationMinutes: number;
  stepMinutes?: number;
  bufferMinutes?: number;
}): { slots: Slot[]; nextAvailable: Slot | null } {
  const step = opts.stepMinutes ?? SHOP.slotStepMinutes;
  const buffer = opts.bufferMinutes ?? SHOP.bufferMinutes;

  if (!opts.rule || opts.rule.is_day_off) {
    return { slots: [], nextAvailable: null };
  }

  const workStart = parseTimeToDate(opts.day, opts.rule.work_start);
  const workEnd = parseTimeToDate(opts.day, opts.rule.work_end);

  const breakInterval: Interval | null =
    opts.rule.break_start && opts.rule.break_end
      ? {
          start: parseTimeToDate(opts.day, opts.rule.break_start),
          end: parseTimeToDate(opts.day, opts.rule.break_end),
        }
      : null;

  const slots: Slot[] = [];

  for (
    let t = new Date(workStart);
    t.getTime() + opts.durationMinutes * 60_000 <= workEnd.getTime();
    t = new Date(t.getTime() + step * 60_000)
  ) {
    const slot: Interval = {
      start: t,
      end: new Date(t.getTime() + opts.durationMinutes * 60_000),
    };

    const slotWithBuffer: Interval = {
      start: slot.start,
      end: new Date(slot.end.getTime() + buffer * 60_000),
    };

    const isBlocked =
      (breakInterval ? overlaps(slot, breakInterval) : false) ||
      opts.blocked.some((b) => overlaps(slot, b));

    if (isBlocked) {
      slots.push({ start: slot.start, end: slot.end, state: "BLOCKED" });
      continue;
    }

    const isBooked = opts.busy.some((b) => overlaps(slotWithBuffer, b));
    slots.push({ start: slot.start, end: slot.end, state: isBooked ? "BOOKED" : "AVAILABLE" });
  }

  const nextAvailable = slots.find((s) => s.state === "AVAILABLE") ?? null;
  return { slots, nextAvailable };
}


