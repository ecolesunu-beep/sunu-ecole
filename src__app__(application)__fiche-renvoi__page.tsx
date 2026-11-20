import type { Metadata } from "next";
import { FichePage } from "@/components/app/fiche";
export const metadata: Metadata = { title: "Fiche de renvoi" };
export default function Page() { return <FichePage />; }
