import { redirect } from "next/navigation";
import { loginFor, safeWorkspaceDestination } from "@/lib/workspace-navigation";

// Both French and English addresses lead to the same sign-in form.
export default async function ConnexionPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  redirect(loginFor(safeWorkspaceDestination((await searchParams).next)));
}
