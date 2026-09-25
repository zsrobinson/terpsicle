// PROTOTYPE round 2: four answers to "where do details open?", all built on the Workbench layout.
// Switch with #1..#4 (or ?variant=1) and the floating bar. Mock data, in-memory state.
import { ChevronLeft, ChevronRight, Moon } from "lucide-react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { StoreProvider } from "./store";
import "./styles.css";
import { Toast, TooltipLayer, useAppKeys } from "./ui";
import { VariantDrill } from "./variants/Drill";
import { VariantPop } from "./variants/Pop";
import { VariantRight } from "./variants/Right";
import { VariantSide } from "./variants/Side";

const VARIANTS = [
  { key: "1", name: "Drill in", blurb: "Only a left sidebar; details replace the list, with Back", C: VariantDrill },
  { key: "2", name: "Side by side", blurb: "Details open in a second column next to the list", C: VariantSide },
  { key: "3", name: "On the right", blurb: "A right panel appears only while you look at something", C: VariantRight },
  { key: "4", name: "Pop over", blurb: "Details float next to whatever you clicked", C: VariantPop },
] as const;

const initial = () => {
  const k = location.hash.slice(1) || new URLSearchParams(location.search).get("variant") || "1";
  return Math.max(0, VARIANTS.findIndex((v) => v.key === k));
};

function cycleTheme() {
  const el = document.documentElement;
  const dark = el.dataset.theme ? el.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  el.dataset.theme = dark ? "light" : "dark";
}

function Shell() {
  useAppKeys();
  const [i, setI] = useState(initial);
  const v = VARIANTS[i];
  const go = (n: number) => {
    const next = (n + VARIANTS.length) % VARIANTS.length;
    setI(next);
    history.replaceState(null, "", "#" + VARIANTS[next].key);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowLeft") go(i - 1);
      if (e.key === "ArrowRight") go(i + 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  return (
    <>
      <div className="h-full"><v.C key={v.key} /></div>
      <Toast />
      <TooltipLayer />
      {/* prototype switcher: deliberately not part of the design */}
      <div data-keep-popover className="fixed bottom-3 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#111] p-1 text-white shadow-[0_8px_30px_rgba(0,0,0,.35)] ring-1 ring-white/10" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <button onClick={() => go(i - 1)} className="flex size-8 items-center justify-center rounded-full hover:bg-white/10" aria-label="Previous variant"><ChevronLeft size={16} /></button>
        <div className="min-w-[230px] px-2 text-center leading-tight max-sm:min-w-[120px]">
          <div className="text-[12.5px] font-medium"><span className="font-mono text-white/50">{v.key}/4</span> · {v.name}</div>
          <div className="text-[10.5px] text-white/55 max-sm:hidden">{v.blurb}</div>
        </div>
        <button onClick={() => go(i + 1)} className="flex size-8 items-center justify-center rounded-full hover:bg-white/10" aria-label="Next variant"><ChevronRight size={16} /></button>
        <span className="mx-1 h-5 w-px bg-white/15" />
        <button onClick={cycleTheme} className="flex size-8 items-center justify-center rounded-full hover:bg-white/10" aria-label="Toggle theme"><Moon size={14} /></button>
        <span className="pr-3 pl-1 font-mono text-[10px] text-white/45 max-md:hidden">prototype · mock data</span>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><StoreProvider><Shell /></StoreProvider></StrictMode>);
