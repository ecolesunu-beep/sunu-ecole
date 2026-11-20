import type { Metadata } from "next";
import { OnboardingPage } from "@/components/app/onboarding";
export const metadata: Metadata = { title: "Préparer votre école" };
export default function Page() { return <OnboardingPage />; }
