import type { Metadata } from "next";
import { SettingsPage } from "@/components/app/settings";
export const metadata: Metadata = { title: "Paramètres" };
export default function Page() { return <SettingsPage />; }
