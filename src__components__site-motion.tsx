"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Brand } from "@/components/brand";

export function SiteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const firstPath = useRef(pathname);
  const [visible, setVisible] = useState(pathname === "/");
  const [exit, setExit] = useState(false);
  const [routeTransition, setRouteTransition] = useState(false);
  useEffect(() => {
    if (firstPath.current !== "/") return;
    // Embedded previews should show the page immediately. Never hold the page
    // behind an animation in an inactive tab or when reduced motion is enabled.
    if (window.self !== window.top || document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = window.setTimeout(() => setVisible(false), 0);
      return () => window.clearTimeout(timer);
    }
    const started = performance.now();
    let frame = 0;
    const finish = window.setTimeout(() => { cancelAnimationFrame(frame); setVisible(false); }, 2150);
    const tick = (now: number) => {
      const next = Math.min(100, Math.round((now - started) / 16));
      setProgress(next);
      if (next < 100) frame = requestAnimationFrame(tick);
      else setExit(true);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(finish); };
  }, []);
  useEffect(() => { const start = window.setTimeout(() => setRouteTransition(true), 0); const end = window.setTimeout(() => setRouteTransition(false), 380); return () => { clearTimeout(start); clearTimeout(end); }; }, [pathname]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const center = window.innerHeight / 2;
      document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((element) => {
        const rect = element.getBoundingClientRect();
        const factor = Number(element.dataset.parallax || 0.05);
        const offset = (rect.top + rect.height / 2 - center) * factor;
        element.style.translate = `0 ${Math.max(-42, Math.min(42, offset)).toFixed(1)}px`;
      });
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [pathname]);
  return <>
    {visible && <div className={`intro-screen ${exit ? "intro-screen--exit" : ""}`} aria-live="polite">
      <div className="intro-center"><div className="intro-mark"><Brand compact light /></div><div className="intro-name" aria-label="Sunu École">{"SUNU ÉCOLE".split("").map((letter, index) => <span key={index} style={{ animationDelay: `${index * 65}ms` }}>{letter === " " ? "\u00a0" : letter}</span>)}</div><p>Notre école, notre discipline, notre suivi.</p></div>
      <div className="intro-progress"><div className="intro-progress__top"><span>{progress < 34 ? "Chargement..." : progress < 85 ? "Préparation de votre école..." : "Bienvenue"}</span><strong>{progress}%</strong></div><div className="intro-progress__track"><span style={{ width: `${progress}%` }} /></div></div>
    </div>}
    <div className={routeTransition ? "route-content route-content--enter" : "route-content"}>{children}</div>
  </>;
}
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={false} whileInView={reduced ? {} : { opacity: [.85, 1], y: [13, 0] }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: .65, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}
export function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => { const fraction = Math.min(1, (now - start) / 900); setDisplay(Math.round(value * (1 - Math.pow(1 - fraction, 3)))); if (fraction < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{display.toLocaleString("fr-FR")}</>;
}
