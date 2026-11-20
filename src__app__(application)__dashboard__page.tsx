import type { Metadata } from "next";
import { DashboardPage } from "@/components/app/dashboard";
export const metadata: Metadata = { title: "Tableau de bord" };
export default function Page() { return <DashboardPage />; }
