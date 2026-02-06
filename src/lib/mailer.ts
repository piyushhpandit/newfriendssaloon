import nodemailer from "nodemailer";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();
  const secureRaw = process.env.SMTP_SECURE?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const fromName = process.env.SMTP_FROM_NAME?.trim();
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim();

  if (!host) throw new Error("Missing environment variable: SMTP_HOST");
  if (!portRaw) throw new Error("Missing environment variable: SMTP_PORT");
  if (!secureRaw) throw new Error("Missing environment variable: SMTP_SECURE");
  if (!user) throw new Error("Missing environment variable: SMTP_USER");
  if (!pass) throw new Error("Missing environment variable: SMTP_PASS");
  if (!fromName) throw new Error("Missing environment variable: SMTP_FROM_NAME");
  if (!fromEmail) throw new Error("Missing environment variable: SMTP_FROM_EMAIL");

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) throw new Error("Invalid SMTP_PORT");

  const secure = secureRaw.toLowerCase() === "true";

  return { host, port, secure, user, pass, fromName, fromEmail };
}

export function getMailerTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;
  const cfg = getSmtpConfig();
  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  return cachedTransporter;
}

export async function sendOtpEmail(params: { to: string; otp: string; appName?: string }) {
  const cfg = getSmtpConfig();
  const transporter = getMailerTransporter();

  const appName = params.appName?.trim() || "New Friends Saloon";
  const otp = params.otp.trim();
  const to = params.to.trim();

  await transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    to,
    subject: `${appName} login code: ${otp}`,
    text: `Your ${appName} login code is: ${otp}\n\nIf you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
        <h2 style="margin:0 0 12px;">${appName} login</h2>
        <p style="margin:0 0 12px;">Your one-time code is:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:2px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:12px;display:inline-block;">
          ${otp}
        </div>
        <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">
          If you didn't request this, you can ignore this email.
        </p>
      </div>
    `,
  });
}

