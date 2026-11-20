import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { ContactContent } from "@/components/public-pages";
export const metadata: Metadata = { title: "Contact", description: "Contacter l'équipe Sunu École à ecolesunu@gmail.com." };
export default function ContactPage() { return <PublicShell><ContactContent /></PublicShell>; }
