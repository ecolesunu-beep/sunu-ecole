import type { Metadata } from "next";
import { AuthView } from "@/components/auth-pages";
import { safeWorkspaceDestination } from "@/lib/workspace-navigation";
export const metadata: Metadata = { title: "Connexion" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <AuthView mode="login" nextPath={safeWorkspaceDestination((await searchParams).next)} />;
}
