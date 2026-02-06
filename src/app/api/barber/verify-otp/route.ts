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

    // Ensure the magic-link redirect never falls back to localhost in production.
    // Prefer explicit env, otherwise derive from the current request origin (Vercel domain).
    const reqOrigin = new URL(req.url).origin;
    const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || reqOrigin;
    const redirectTo = `${site.replace(/\/+$/, "")}/barber`;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (error) return jsonError(error.message, 500);

    // Use token-hash verification to establish a Supabase session WITHOUT browser redirects.
    const props = (data as unknown as { properties?: Record<string, unknown> } | null)?.properties ?? null;
    const token_hash = typeof props?.hashed_token === "string" ? (props.hashed_token as string) : "";
    const type = typeof props?.verification_type === "string" ? (props.verification_type as string) : "";
    if (!token_hash) return jsonError("Could not create login token.", 500);

    return NextResponse.json({ ok: true, token_hash, type: type || "magiclink" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonError(message, 500);
  }
}
