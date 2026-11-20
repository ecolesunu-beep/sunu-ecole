"use client";
import Link from "next/link";
import { useSyncExternalStore, type ComponentProps } from "react";
import { matchesPreviewHost } from "@/lib/preview-hosts";

const subscribe = () => () => {};
function needsSeparateTab() {
  if (window.self === window.top) return false;
  const allowed = (process.env.NEXT_PUBLIC_SUNU_PREVIEW_ANCESTORS || "").split(" ").filter(Boolean);
  if (!allowed.length) return true;
  const ancestry = Array.from(window.location.ancestorOrigins || []);
  if (ancestry.length) return ancestry.some((origin) => origin !== window.location.origin && !matchesPreviewHost(origin, allowed));
  if (!document.referrer) return true;
  const parent = new URL(document.referrer).origin;
  return parent !== window.location.origin && !matchesPreviewHost(parent, allowed);
}
export function WorkspaceLink(props: ComponentProps<typeof Link>) {
  const separateTab = useSyncExternalStore(subscribe, needsSeparateTab, () => false);
  const path = typeof props.href === "string" ? props.href.split(/[?#]/)[0] : props.href.pathname || "/";
  const workspace = !["/", "/espace-ecole", "/fonctionnalites", "/faq", "/contact"].includes(path);
  return <Link {...props} {...(separateTab && workspace ? { target: "_blank", rel: "noopener", prefetch: false, title: "Ouvrir l’espace école dans un nouvel onglet" } : {})} />;
}
