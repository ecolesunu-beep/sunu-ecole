import type { Metadata } from "next";
import { AuthView } from "@/components/auth-pages";
import { safeWorkspaceDestination } from "@/lib/workspace-navigation";
export const metadata: Metadata = { title: "Inscription" };
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <AuthView mode="signup" nextPath={safeWorkspaceDestination((await searchParams).next)} />;
}
