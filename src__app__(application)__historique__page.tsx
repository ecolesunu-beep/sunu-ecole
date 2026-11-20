import type { Metadata } from "next";
import { HistoryPage } from "@/components/app/analysis";
export const metadata: Metadata = { title: "Historique des actions" };
export default function Page() { return <HistoryPage />; }
