import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { BARBER_EMAILS } from "@/lib/supabase/env";
import crypto from "crypto";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!email) return jsonError("Email is required.");
    if (!BARBER_EMAILS.length) return jsonError("Server is missing NEXT_PUBLIC_BARBER_EMAILS.", 500);
    if (!BARBER_EMAILS.includes(email)) return jsonError("Access denied.", 403);

    if (!/^\d{4}$/.test(code)) return jsonError("Enter the 4-digit code.");

    const admin = supabaseAdmin();
    const res = await admin.from("barber_email_otps").select("code_hash,expires_at").eq("email", email).maybeSingle();
    if (res.error) return jsonError(res.error.message, 500);
    if (!res.data) return jsonError("Code expired. Please request a new one.");

    const expiresAt = new Date(res.data.expires_at);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      await admin.from("barber_email_otps").delete().eq("email", email);
      return jsonError("Code expired. Please request a new one.");
    }

    if (res.data.code_hash !== hashOtp(code)) return jsonError("Invalid code.");

    await admin.from("barber_email_otps").delete().eq("email", email);

    const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
    const redirectTo = site ? `${site.replace(/\/+$/, "")}/barber` : undefined;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) return jsonError(error.message, 500);

    const props = (data as unknown as { properties?: Record<string, unknown> } | null)?.properties ?? null;
    const actionLink =
      (typeof (data as { action_link?: string } | null)?.action_link === "string"
        ? (data as { action_link: string }).action_link
        : null) ||
      (typeof props?.action_link === "string" ? (props.action_link as string) : "");
    if (!actionLink) return jsonError("Could not create login link.", 500);

    return NextResponse.json({ ok: true, actionLink });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonError(message, 500);
  }
}
