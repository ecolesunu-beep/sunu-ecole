import "server-only";
import nodemailer from "nodemailer";

export async function sendMail(to: string, subject: string, text: string) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new Error("L'envoi d'e-mail n'est pas configuré. Renseignez SMTP_HOST, SMTP_USER et SMTP_PASS dans .env.");
  const port = Number(SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS }, requireTLS: port !== 465 });
  await transporter.sendMail({ from: process.env.SMTP_FROM || "ecolesunu@gmail.com", to, subject, text });
}
