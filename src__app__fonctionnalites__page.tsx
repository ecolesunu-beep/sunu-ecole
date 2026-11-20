import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { FeaturesContent } from "@/components/public-pages";
export const metadata: Metadata = { title: "Fonctionnalités", description: "Découvrez les modules de suivi disciplinaire de Sunu École." };
export default function FeaturesPage() { return <PublicShell><FeaturesContent /></PublicShell>; }
