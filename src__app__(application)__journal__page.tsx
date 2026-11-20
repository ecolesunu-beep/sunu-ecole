import type { Metadata } from "next";
import { JournalPage } from "@/components/app/journal";
export const metadata: Metadata = { title: "Journal de discipline" };
export default function Page() { return <JournalPage />; }
