import type { Metadata } from "next";
import { StudentsPage } from "@/components/app/students";
export const metadata: Metadata = { title: "Gestion des élèves" };
export default function Page() { return <StudentsPage />; }
