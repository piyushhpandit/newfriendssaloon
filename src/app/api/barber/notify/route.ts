import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendBarberNotificationEmail } from "@/lib/mailer";
import { SHOP } from "@/lib/shop";

export const runtime = "nodejs";

type NotifyType = "booking_confirmed" | "checkin" | "cancelled";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
}

function formatServices(services: Array<{ service_name: string; duration_minutes: number; price_rupees: number }>): string {
  if (!services.length) return "None";
  return services.map((s) => `${s.service_name} (${s.duration_minutes} min, ₹${s.price_rupees})`).join(", ");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { type?: unknown; bookingId?: unknown } | null;
    const type = typeof body?.type === "string" ? body.type : "";
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    if (!type || !bookingId) return jsonError("Missing notification details.");
    if (!["booking_confirmed", "checkin", "cancelled"].includes(type)) return jsonError("Unsupported notification type.");

    const admin = supabaseAdmin();
    const bookingRes = await admin
      .from("bookings")
      .select("id,customer_name,customer_phone,start_time,end_time,status,created_at")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingRes.error) return jsonError(bookingRes.error.message, 500);
    if (!bookingRes.data) return jsonError("Booking not found.", 404);

    const servicesRes = await admin
      .from("booking_services")
      .select("service_name,price_rupees,duration_minutes,sort_order")
      .eq("booking_id", bookingId)
      .order("sort_order", { ascending: true });
    if (servicesRes.error) return jsonError(servicesRes.error.message, 500);

    const b = bookingRes.data;
    const services = (servicesRes.data ?? []) as Array<{ service_name: string; duration_minutes: number; price_rupees: number }>;
    const when = `${formatDateTime(b.start_time)} → ${formatDateTime(b.end_time)}`;
    const serviceSummary = formatServices(services);

    const verb =
      type === "booking_confirmed" ? "Booking confirmed" : type === "checkin" ? "Customer checked in" : "Booking cancelled";
    const subject = `${SHOP.name} · ${verb}`;
    const text = [
      `${verb}`,
      `Name: ${b.customer_name}`,
      `Phone: ${b.customer_phone}`,
      `Time: ${when}`,
      `Services: ${serviceSummary}`,
      `Status: ${b.status}`,
      `Booking ID: ${b.id}`,
    ].join("\n");

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
        <h2 style="margin:0 0 12px;">${SHOP.name}</h2>
        <div style="margin:0 0 10px;font-weight:600;">${verb}</div>
        <div style="margin:0 0 4px;"><strong>Name:</strong> ${b.customer_name}</div>
        <div style="margin:0 0 4px;"><strong>Phone:</strong> ${b.customer_phone}</div>
        <div style="margin:0 0 4px;"><strong>Time:</strong> ${when}</div>
        <div style="margin:0 0 4px;"><strong>Services:</strong> ${serviceSummary}</div>
        <div style="margin:0 0 4px;"><strong>Status:</strong> ${b.status}</div>
        <div style="margin:0 0 4px;"><strong>Booking ID:</strong> ${b.id}</div>
      </div>
    `;

    await sendBarberNotificationEmail({ subject, text, html });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonError(message, 500);
  }
}
