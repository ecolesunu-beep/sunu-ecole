import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { FAQContent } from "@/components/public-pages";
export const metadata: Metadata = { title: "FAQ", description: "Réponses aux questions sur l'équipe, l'import Excel et la sécurité des données." };
export default function FAQPage() { return <PublicShell><FAQContent /></PublicShell>; }
