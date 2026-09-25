// PROTOTYPE review page: one open question at a time, options previewed live, answers saved.
import clsx from "clsx";
import { Check, ChevronLeft, ChevronRight, Copy, Moon, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreProvider } from "../store";
import { Toast, TooltipLayer } from "../ui";
import { BASE, DesignCtx, type Design } from "./design";
import { MobilePreview } from "./mobile";
import { GROUPS, QUESTIONS, type Question } from "./questions";
import { ReviewApp } from "./shell";

type Answer = { choice?: string; note?: string; updatedAt?: number };
type Answers = Record<string, Answer>;

// ---------- persistence: artifact db when available, localStorage always ----------
type DocRef = { set: (d: Record<string, unknown>) => Promise<void> };
type DB = { doc: (p: string) => DocRef; collection: (p: string) => { onSnapshot: (n: (s: { docs: { id: string; data: () => Record<string, unknown> | undefined }[] }) => void, e?: (err: unknown) => void) => () => void } };
declare global { interface Window { claude?: { use: (name: string) => Promise<unknown> } } }
const LS = "terpsicle-review-answers";
const readLocal = (): Answers => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } };
const writeLocal = (a: Answers) => { try { localStorage.setItem(LS, JSON.stringify(a)); } catch { /* storage unavailable */ } };

function useAnswers() {
  const [answers, setAnswers] = useState<Answers>(readLocal);
  const [synced, setSynced] = useState<"local" | "saved" | "saving">("local");
  const db = useRef<DB | null>(null);
  const chains = useRef<Record<string, Promise<void>>>({});
  const timers = useRef<Record<string, number>>({});
  const latest = useRef(answers);
  latest.current = answers;
  useEffect(() => {
    let unsub: (() => void) | undefined;
    window.claude?.use("db").then((d) => {
      if (!d) return;
      db.current = d as DB;
      setSynced("saved");
      unsub = db.current.collection("answers").onSnapshot((snap) => {
        setAnswers((cur) => {
          const next = { ...cur };
          for (const doc of snap.docs) {
            const v = doc.data() as Answer | undefined;
            if (v && (!cur[doc.id]?.updatedAt || (v.updatedAt ?? 0) >= (cur[doc.id].updatedAt ?? 0))) next[doc.id] = v;
          }
          writeLocal(next);
          return next;
        });
      }, () => setSynced("local"));
    }).catch(() => {});
    return () => unsub?.();
  }, []);
  const push = useCallback((id: string) => {
    if (!db.current) return;
    setSynced("saving");
    chains.current[id] = (chains.current[id] ?? Promise.resolve()).then(() => db.current!.doc(`answers/${id}`).set({ ...latest.current[id] })).then(() => setSynced("saved")).catch(() => setSynced("local"));
  }, []);
  const set = useCallback((id: string, patch: Answer, debounce = false) => {
    setAnswers((cur) => {
      const next = { ...cur, [id]: { ...cur[id], ...patch, updatedAt: Date.now() } };
      writeLocal(next);
      latest.current = next;
      return next;
    });
    clearTimeout(timers.current[id]);
    if (debounce) timers.current[id] = window.setTimeout(() => push(id), 800);
    else setTimeout(() => push(id), 0);
  }, [push]);
  return { answers, set, synced };
}

// ---------- page ----------
export function ReviewPage() {
  const { answers, set, synced } = useAnswers();
  const [qi, setQi] = useState(() => { const h = location.hash.slice(1); const i = QUESTIONS.findIndex((q) => q.id === h); return i >= 0 ? i : 0; });
  const q = QUESTIONS[qi];
  const [viewing, setViewing] = useState<string>(q.options[0]?.value ?? "");
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    const a = answers[q.id]?.choice;
    setViewing(q.kind === "quick" ? "" : a && q.options.some((o) => o.value === a) ? a : (q.rec ?? q.options[0]?.value ?? ""));
    history.replaceState(null, "", "#" + q.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || !q.options.length || q.kind === "quick") return;
      const i = q.options.findIndex((o) => o.value === viewing);
      if (e.key === "ArrowRight") setViewing(q.options[(i + 1) % q.options.length].value);
      if (e.key === "ArrowLeft") setViewing(q.options[(i - 1 + q.options.length) % q.options.length].value);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [q, viewing]);

  const decided = QUESTIONS.filter((x) => x.kind !== "text" && answers[x.id]?.choice != null).length;
  const total = QUESTIONS.filter((x) => x.kind !== "text").length;
  const acceptRest = () => QUESTIONS.forEach((x) => { if (x.kind !== "text" && answers[x.id]?.choice == null && x.rec != null) set(x.id, { choice: x.rec }); });
  const summary = useMemo(() => QUESTIONS.map((x) => {
    const a = answers[x.id];
    if (x.kind === "text") return a?.note ? `## ${x.title}\n${a.note}` : "";
    const pick = x.kind === "quick" ? (a?.choice ?? "").split(",").filter(Boolean).map((v) => x.options.find((o) => o.value === v)?.label).join("; ") || "(none checked)" : x.options.find((o) => o.value === a?.choice)?.label ?? "(not answered)";
    const recL = x.kind === "quick" ? "" : ` (rec: ${x.options.find((o) => o.value === x.rec)?.label})`;
    return `- **${x.title}:** ${pick}${recL}${a?.note ? `\n  - Note: ${a.note}` : ""}`;
  }).filter(Boolean).join("\n"), [answers]);
  const copy = () => { navigator.clipboard?.writeText(summary).then(() => setCopied("Copied")).catch(() => setCopied("select")); setTimeout(() => setCopied(null), 2500); };

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="text-[13.5px] font-semibold tracking-tight">Terpsicle · final design review</span>
        <div className="hidden items-center gap-2 md:flex">
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-hover"><div className="h-full rounded-full bg-fg" style={{ width: `${(decided / total) * 100}%` }} /></div>
          <span className="tnum text-[12px] text-muted">{decided} of {total} decided</span>
        </div>
        <span className="text-[11.5px] text-faint" data-tip={synced === "local" ? "Saved in this browser only" : "Saved where Claude can read it"}>{synced === "saving" ? "Saving…" : synced === "saved" ? "Saved" : "Saved locally"}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={acceptRest} className="h-8 rounded-md border border-border px-2.5 text-[12.5px] hover:border-border-strong" data-tip="Only fills questions you haven't answered">Use my recommendations for the rest</button>
          <button onClick={copy} className="flex h-8 items-center gap-1.5 rounded-md bg-fg px-2.5 text-[12.5px] font-medium text-bg"><Copy size={13} />{copied === "Copied" ? "Copied" : "Copy answers"}</button>
          <button onClick={() => { const el = document.documentElement; const dark = el.dataset.theme ? el.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; el.dataset.theme = dark ? "light" : "dark"; }} className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover" data-tip="Toggle theme"><Moon size={15} /></button>
        </div>
      </header>
      {copied === "select" && (
        <div className="border-b border-border bg-panel p-3"><p className="mb-1 text-[12px] text-muted">Copying isn't allowed here. Select all and copy this instead:</p><textarea id="summary-fallback" readOnly value={summary} className="h-40 w-full rounded border border-border bg-bg p-2 font-mono text-[11.5px]" onFocus={(e) => e.target.select()} autoFocus /></div>
      )}
      <div className="flex min-h-0 flex-1">
        <nav className="scroll-thin hidden w-[250px] shrink-0 overflow-y-auto border-r border-border bg-panel py-2 lg:block">
          {GROUPS.map((g) => (
            <div key={g} className="mb-2">
              <div className="px-4 pt-2 pb-1 text-[11px] font-medium text-muted">{g}</div>
              {QUESTIONS.map((x, i) => x.group !== g ? null : (
                <button key={x.id} onClick={() => setQi(i)} className={clsx("flex w-full items-center gap-2 px-4 py-1.5 text-left text-[12.5px]", i === qi ? "bg-raised font-medium shadow-sm" : "text-muted hover:text-fg")}>
                  <StatusDot q={x} a={answers[x.id]} />
                  <span className="truncate">{x.title}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-5 pt-4 pb-3">
            <div className="text-[11.5px] text-muted">{q.group} · {qi + 1} of {QUESTIONS.length}</div>
            <h1 className="mt-0.5 text-[18px] font-semibold tracking-tight text-balance">{q.title}</h1>
            <p className="mt-1 max-w-[75ch] text-[13px] text-muted">{q.why}</p>
            {q.kind !== "quick" && q.kind !== "text" && (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {q.options.map((o, i) => {
                    const chosen = answers[q.id]?.choice === o.value;
                    return (
                      <button key={o.value} onClick={() => setViewing(o.value)}
                        className={clsx("relative min-w-[170px] max-w-[260px] flex-1 rounded-lg border px-3 py-2 text-left", viewing === o.value ? "border-fg bg-raised shadow-sm" : "border-border hover:border-border-strong")}>
                        <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
                          <span className="font-mono text-[11px] text-faint">{String.fromCharCode(65 + i)}</span>{o.label}
                          {q.rec === o.value && <span className="ml-auto flex items-center gap-0.5 text-[10.5px] font-normal text-muted" data-tip="My recommendation"><Star size={10} className="fill-current" />rec</span>}
                          {chosen && <span className={clsx("flex size-4 items-center justify-center rounded-full bg-ok text-white", q.rec !== o.value && "ml-auto")}><Check size={11} /></span>}
                        </div>
                        <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{o.desc}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[12px]">
                  <button onClick={() => set(q.id, { choice: viewing })} disabled={answers[q.id]?.choice === viewing}
                    className="h-8 rounded-md bg-fg px-3 text-[12.5px] font-medium text-bg disabled:bg-ok disabled:text-white">
                    {answers[q.id]?.choice === viewing ? `✓ ${q.options.find((o) => o.value === viewing)?.label}` : `Pick “${q.options.find((o) => o.value === viewing)?.label}”`}
                  </button>
                  {q.rec && <span className="text-muted"><Star size={11} className="-mt-0.5 inline fill-current" /> <b className="font-medium text-fg">I'd pick {q.options.find((o) => o.value === q.rec)?.label}.</b> {q.recWhy}</span>}
                </div>
                {q.tryThis && <div className="mt-1.5 text-[12px] text-muted"><span className="font-medium text-fg">Try:</span> {q.tryThis} <span className="text-faint">· ←/→ switches options</span></div>}
              </>
            )}
          </div>
          <div className="min-h-0 flex-1 bg-panel p-3">
            {q.kind === "app" && <AppPreview key={q.id + viewing} q={q} value={viewing} />}
            {q.kind === "mobile" && <div className="h-full overflow-hidden rounded-xl border border-border"><MobilePreview mode={viewing as "today"} /></div>}
            {q.kind === "quick" && <QuickCalls q={q} a={answers[q.id]} set={(c) => set(q.id, { choice: c })} />}
            {q.kind === "text" && <textarea id="anything-else" defaultValue={answers[q.id]?.note ?? ""} onChange={(e) => set(q.id, { note: e.target.value }, true)} placeholder="Type anything…" className="h-full w-full rounded-xl border border-border bg-bg p-4 text-[13.5px] outline-none focus:border-border-strong" />}
          </div>
          <footer className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2.5">
            {q.kind !== "text" && <input key={q.id} id={"note-" + q.id} defaultValue={answers[q.id]?.note ?? ""} onChange={(e) => set(q.id, { note: e.target.value }, true)} placeholder="Why? Tweaks? Mix of options? (optional)" className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 text-[13px] outline-none focus:border-border-strong" />}
            {q.kind === "text" && <div className="flex-1" />}
            <button onClick={() => setQi(Math.max(0, qi - 1))} disabled={qi === 0} className="flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-[12.5px] disabled:opacity-40"><ChevronLeft size={14} />Back</button>
            <button onClick={() => setQi(Math.min(QUESTIONS.length - 1, qi + 1))} disabled={qi === QUESTIONS.length - 1} className="flex h-9 items-center gap-1 rounded-lg bg-fg px-3 text-[12.5px] font-medium text-bg disabled:opacity-40">Next<ChevronRight size={14} /></button>
          </footer>
        </main>
      </div>
      <TooltipLayer />
    </div>
  );
}

function StatusDot({ q, a }: { q: Question; a?: Answer }) {
  const done = q.kind === "text" ? !!a?.note : a?.choice != null;
  const agreed = done && q.kind === "app" && a?.choice === q.rec;
  return <span className={clsx("size-2 shrink-0 rounded-full", done ? (agreed || q.kind !== "app" ? "bg-fg/60" : "bg-accent") : "border border-border-strong")} data-tip={done ? (agreed ? "Picked my recommendation" : q.kind === "app" ? "Picked something else" : "Answered") : "Not answered yet"} />;
}

function AppPreview({ q, value }: { q: Question; value: string }) {
  const design: Design = { ...BASE, ...q.extra, [q.field!]: q.field === "collapsible" ? value === "true" : value };
  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-border bg-bg shadow-sm" style={{ transform: "translateZ(0)" }}>
      <DesignCtx.Provider value={design}>
        <StoreProvider initial={q.initialFor?.[value] ?? q.initial}>
          <ReviewApp shared={!!q.extra?._sharedMode} />
          <Toast />
        </StoreProvider>
      </DesignCtx.Provider>
    </div>
  );
}

function QuickCalls({ q, a, set }: { q: Question; a?: Answer; set: (c: string) => void }) {
  const checked = new Set((a?.choice ?? q.rec ?? "").split(",").filter(Boolean));
  return (
    <div className="mx-auto max-w-[680px] rounded-xl border border-border bg-bg p-2">
      {q.options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] hover:bg-hover">
          <input type="checkbox" id={"quick-" + o.value} checked={checked.has(o.value)} onChange={(e) => { const n = new Set(checked); e.target.checked ? n.add(o.value) : n.delete(o.value); set([...n].join(",")); }} />
          {o.label}
          {(q.rec ?? "").split(",").includes(o.value) && <span className="ml-auto text-[11px] text-faint">I'd say yes</span>}
        </label>
      ))}
      {a?.choice == null && <button onClick={() => set(q.rec ?? "")} className="m-2 h-8 rounded-md border border-border px-3 text-[12.5px]">These look right</button>}
    </div>
  );
}
