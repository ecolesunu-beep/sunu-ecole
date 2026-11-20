import type { Metadata } from "next";
import { AuthView } from "@/components/auth-pages";
export const metadata: Metadata = { title: "Réinitialiser le mot de passe" };
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const { token } = await searchParams; return <AuthView mode="reset" token={token || ""} />; }
