import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteMotion } from "@/components/site-motion";
import "./globals.css";
import "./recovery.css";
import "./workspace-navigation.css";
import "./reference-layout.css";

export const metadata: Metadata = {
  title: { default: "Sunu École — Notre école, notre discipline, notre suivi.", template: "%s | Sunu École" },
  description: "Un espace de travail partagé pour le suivi de discipline des établissements scolaires. Élèves, journal, synthèses et fiches au même endroit.",
  icons: { icon: "/brand-s.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fr"><body><noscript><style>{'.intro-screen{display:none!important}'}</style><div className="sunu-script-notice">Activez JavaScript pour vous connecter et utiliser l’espace de votre école.</div></noscript><SiteMotion>{children}</SiteMotion></body></html>;
}
