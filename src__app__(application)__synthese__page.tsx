import type { Metadata } from "next";
import { SummaryPage } from "@/components/app/analysis";
export const metadata: Metadata = { title: "Synthèse disciplinaire" };
export default function Page() { return <SummaryPage />; }
