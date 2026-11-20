import type { Metadata } from "next";
import { AuthView } from "@/components/auth-pages";
export const metadata: Metadata = { title: "Mot de passe oublié" };
export default function ForgotPage() { return <AuthView mode="forgot" />; }
