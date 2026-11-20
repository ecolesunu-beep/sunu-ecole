import type { Metadata } from "next";
import { StudentProfilePage } from "@/components/app/students";
export const metadata: Metadata = { title: "Fiche individuelle" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <StudentProfilePage id={id} />; }
