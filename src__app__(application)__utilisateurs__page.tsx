import type { Metadata } from "next";
import { TeamPage } from "@/components/app/team";
export const metadata: Metadata = { title: "Gestion des utilisateurs" };
export default function Page() { return <TeamPage />; }
