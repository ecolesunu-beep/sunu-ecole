import Link from "next/link";
export function Brand({ light = false, compact = false, href = "/" }: { light?: boolean; compact?: boolean; href?: string }) {
  return <Link href={href} className={`brand ${light ? "brand--light" : ""} ${compact ? "brand--compact" : ""}`} aria-label={href === "/dashboard" ? "Sunu École — Tableau de bord" : "Sunu École — Accueil"}>
    <img src={light ? "/brand-s-light.svg" : "/brand-s.svg"} alt="" width="44" height="44" />
    {!compact && <span className="brand__wordmark">Sunu École</span>}
  </Link>;
}
