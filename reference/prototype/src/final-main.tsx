// REFERENCE PROTOTYPE: the Drill-in app with every pick from the final review applied (design.FINAL).
// Mock data, in-memory state. This is a visual and interaction reference for v2, not production code.
import { Moon, RotateCcw, UserRound } from "lucide-react";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { StoreProvider } from "./store";
import "./styles.css";
import { Toast, TooltipLayer } from "./ui";
import { DesignCtx, FINAL } from "./review/design";
import { ReviewApp } from "./review/shell";

function Final() {
  const [firstVisit, setFirstVisit] = useState(location.hash === "#first-visit");
  const [key, setKey] = useState(0);
  const theme = () => {
    const el = document.documentElement;
    const dark = el.dataset.theme ? el.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    el.dataset.theme = dark ? "light" : "dark";
  };
  return (
    <DesignCtx.Provider value={FINAL}>
      <StoreProvider key={key + String(firstVisit)} initial={firstVisit ? { plans: [{ id: "a", name: "Plan A", sections: [], blocks: [] }], shortlist: [] } : undefined}>
        <div className="h-full"><ReviewApp /></div>
        <Toast />
      </StoreProvider>
      <TooltipLayer />
      <div className="fixed bottom-3 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#111] p-1 text-white shadow-[0_8px_30px_rgba(0,0,0,.35)] ring-1 ring-white/10">
        <span className="px-3 font-mono text-[10.5px] text-white/60">reference prototype · mock data</span>
        <button onClick={() => { setFirstVisit(!firstVisit); history.replaceState(null, "", firstVisit ? "#" : "#first-visit"); }} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[11.5px] hover:bg-white/10"><UserRound size={13} />{firstVisit ? "Returning visitor" : "First visit"}</button>
        <button onClick={() => setKey(key + 1)} className="flex size-8 items-center justify-center rounded-full hover:bg-white/10" aria-label="Reset"><RotateCcw size={13} /></button>
        <button onClick={theme} className="flex size-8 items-center justify-center rounded-full hover:bg-white/10" aria-label="Toggle theme"><Moon size={13} /></button>
      </div>
    </DesignCtx.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Final /></StrictMode>);
