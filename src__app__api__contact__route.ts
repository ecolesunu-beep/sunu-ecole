import { NextRequest } from "next/server";
import { sendMail } from "@/lib/mail";
import { originAllowed } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return Response.json({ error: "Origine non autorisée." }, { status: 403 });
  try {
    const body = await request.json();
    if (body.website) return Response.json({ ok: true }); // honeypot
    const school = typeof body.school === "string" ? body.school.trim().slice(0, 160) : "";
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 5000) : "";
    if (!school || !/^\S+@\S+\.\S+$/.test(email) || message.length < 10) return Response.json({ error: "Renseignez votre établissement, un email valide et un message d'au moins 10 caractères." }, { status: 400 });
    await sendMail("ecolesunu@gmail.com", `Message Sunu École — ${school}`, `Établissement : ${school}\nEmail : ${email}\n\n${message}`);
    return Response.json({ message: "Votre message a bien été envoyé." });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message.includes("SMTP") ? error.message : "L'envoi a échoué. Écrivez directement à ecolesunu@gmail.com." }, { status: 503 });
  }
}
