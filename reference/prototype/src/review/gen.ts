// PROTOTYPE: small exhaustive generator (the real one uses bitmasks + merged equivalent sections in a worker).
import { itemsFor, legsFor, profRating, type TravelSettings } from "../core";
import { sectionsOf, type Block, type Day } from "../data";

export type GenOpts = { noBefore: number | null; daysOff: Day[]; travelOk: boolean; sort: "compact" | "late" | "profs" };
export type GenResult = { sections: string[]; days: number; earliest: number; courses: number; rating: number; span: number };

export function generatePlans(required: string[], optional: string[], blocks: Block[], o: GenOpts, t: TravelSettings): GenResult[] {
  const courses = [...required, ...optional];
  const cands = courses.map((c) => sectionsOf(c).filter((s) => s.meetings.every((m) => (o.noBefore == null || m.start >= o.noBefore) && !m.days.some((d) => o.daysOff.includes(d)))));
  const out: GenResult[] = [];
  const pick: string[] = [];
  const clash = (id: string) => {
    const mine = itemsFor([id]);
    return itemsFor(pick, blocks).some((a) => mine.some((b) => a.day === b.day && a.start < b.end && b.start < a.end));
  };
  const rec = (i: number) => {
    if (out.length > 400) return;
    if (i === courses.length) {
      if (!pick.length) return;
      const items = itemsFor(pick, blocks);
      if (o.travelOk && legsFor(items, t).some((l) => l.status === "short")) return;
      const secItems = items.filter((x) => x.kind === "section");
      let span = 0;
      for (let d = 0; d < 5; d++) { const di = secItems.filter((x) => x.day === d); if (di.length) span += Math.max(...di.map((x) => x.end)) - Math.min(...di.map((x) => x.start)); }
      const rs = pick.map((id) => profRating(sectionsOf(id.split("-")[0]).find((s) => s.id === id)!)).filter((x): x is number => x != null);
      out.push({ sections: [...pick], days: new Set(secItems.map((x) => x.day)).size, earliest: Math.min(...secItems.map((x) => x.start)), courses: pick.length, rating: rs.reduce((a, b) => a + b, 0) / (rs.length || 1), span });
      return;
    }
    for (const s of cands[i]) { if (clash(s.id)) continue; pick.push(s.id); rec(i + 1); pick.pop(); }
    if (i >= required.length) rec(i + 1);
  };
  rec(0);
  const key = { compact: (r: GenResult) => r.span + r.days * 60, late: (r: GenResult) => -r.earliest, profs: (r: GenResult) => -r.rating }[o.sort];
  return out.sort((a, b) => b.courses - a.courses || key(a) - key(b)).slice(0, 12);
}
