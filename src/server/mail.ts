import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// E-posta (SMTP). Ayarlar ortam değişkenlerinden: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
// Ayar yoksa gönderim yapılmaz ve açık bir hata döner (panelde düğme uyarı verir).

export const mailReady = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transport: Transporter | null = null;
function smtp() {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

export async function sendMail(opts: { to: string; subject: string; html: string; replyTo?: string; attachments?: { filename: string; content: Buffer }[] }) {
  if (!mailReady()) throw new Error("E-posta ayarları (SMTP) henüz yapılmadı.");
  await smtp().sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, ...opts });
}
