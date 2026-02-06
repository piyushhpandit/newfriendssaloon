import { NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/mailer";
import { SHOP } from "@/lib/shop";
import { BARBER_EMAILS } from "@/lib/supabase/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

export const runtime = "nodejs";

const OTP_TTL_MINUTES = 10;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function generateOtp(): string {
  const n = Math.floor(Math.random() * 10000);
  return String(n).padStart(4, "0");
}

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return jsonError("Email is required.");

    // Hard allowlist: only configured barber emails can request codes.
    if (!BARBER_EMAILS.length) return jsonError("Server is missing NEXT_PUBLIC_BARBER_EMAILS.", 500);
    if (!BARBER_EMAILS.includes(email)) return jsonError("Access denied.", 403);

    // Generate our own 4-digit OTP for email verification.
    const otp = generateOtp();
    const admin = supabaseAdmin();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();
    const store = await admin
      .from("barber_email_otps")
      .upsert({ email, code_hash: hashOtp(otp), expires_at: expiresAt }, { onConflict: "email" });
    if (store.error) return jsonError(store.error.message, 500);

    await sendOtpEmail({ to: email, otp, appName: SHOP.name });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonError(message, 500);
  }
}

