import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendOtpEmail } from "@/lib/mailer";
import { SHOP } from "@/lib/shop";
import { BARBER_EMAILS } from "@/lib/supabase/env";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return jsonError("Email is required.");

    // Hard allowlist: only configured barber emails can request codes.
    if (!BARBER_EMAILS.length) return jsonError("Server is missing NEXT_PUBLIC_BARBER_EMAILS.", 500);
    if (!BARBER_EMAILS.includes(email)) return jsonError("Access denied.", 403);

    const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
    const redirectTo = site ? `${site.replace(/\/+$/, "")}/barber` : undefined;

    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (error) return jsonError(error.message, 500);

    const props = (data as unknown as { properties?: Record<string, unknown> } | null)?.properties ?? null;
    const otp = (typeof props?.email_otp === "string" ? props.email_otp : "").trim();
    if (!otp) return jsonError("Could not generate OTP.", 500);

    await sendOtpEmail({ to: email, otp, appName: SHOP.name });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonError(message, 500);
  }
}

