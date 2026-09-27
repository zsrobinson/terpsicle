import type { FeedbackElement } from "~/core/schema/feedback";
import { PRIVATE } from "./screenshot";

// What a pinned note says about its element (docs/FEEDBACK.md): a selector
// an agent can use to find it again, its visible text (never a private
// element's) and its `data-*` ids.

/** Radix's and React's generated ids change between renders: never used. */
const GENERATED_ID = /^(?:radix-|:r|«r|r\d)|[:«»]/;
/** State and plumbing attributes, not ids. */
const NOISE =
  /^data-(?:state|slot|side|align|orientation|disabled|highlighted|radix-.*|feedback-ui|private)$/;

const cssString = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function idAttributes(el: Element): [string, string][] {
  return [...el.attributes]
    .filter(
      (a) =>
        /^data-[a-z0-9-]{1,40}$/.test(a.name) &&
        !NOISE.test(a.name) &&
        a.value.length <= 200,
    )
    .map((a) => [a.name, a.value]);
}

function unique(selector: string, root: ParentNode): boolean {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/** One step of the path: the element alone, as specifically as we can. */
function step(el: Element): { part: string; anchored: boolean } {
  const tag = el.tagName.toLowerCase();
  const root = el.ownerDocument;
  if (el.id && !GENERATED_ID.test(el.id)) {
    const part = `#${CSS.escape(el.id)}`;
    if (unique(part, root)) return { part, anchored: true };
  }
  for (const [name, value] of idAttributes(el)) {
    const part = value
      ? `${tag}[${name}=${cssString(value)}]`
      : `${tag}[${name}]`;
    if (unique(part, root)) return { part, anchored: true };
  }
  const label = el.getAttribute("aria-label");
  if (label) {
    const part = `${tag}[aria-label=${cssString(label)}]`;
    if (unique(part, root)) return { part, anchored: true };
  }
  const parent = el.parentElement;
  if (!parent) return { part: tag, anchored: false };
  const same = [...parent.children].filter((c) => c.tagName === el.tagName);
  return {
    part: same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(el) + 1})` : tag,
    anchored: false,
  };
}

/**
 * A selector for `el`: from the nearest ancestor with a unique id or
 * `data-*` attribute, then tag and position, at most eight steps.
 */
export function stableSelector(el: Element): string {
  const parts: string[] = [];
  let at: Element | null = el;
  while (at && at !== at.ownerDocument.documentElement && parts.length < 8) {
    const { part, anchored } = step(at);
    parts.unshift(part);
    if (anchored) break;
    at = at.parentElement;
  }
  return parts.join(" > ").slice(0, 500);
}

/** Its text, collapsed, with anything private left out. */
export function visibleText(el: Element): string {
  if (el.closest(PRIVATE)) return "";
  const texts: string[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    if (!node.parentElement?.closest(PRIVATE))
      texts.push(node.textContent ?? "");
  const text = texts.join(" ").replace(/\s+/g, " ").trim();
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

/** Everything a pinned note stores about its element. */
export function describeElement(el: Element): FeedbackElement {
  const ids: Record<string, string> = {};
  let owner: Element | null = el.parentElement;
  // The element's own ids, then the nearest ancestor that has any.
  while (owner && idAttributes(owner).length === 0) owner = owner.parentElement;
  for (const source of [el, owner])
    if (source)
      for (const [name, value] of idAttributes(source))
        if (!(name in ids) && Object.keys(ids).length < 20) ids[name] = value;
  const r = el.getBoundingClientRect();
  const view = el.ownerDocument.defaultView;
  return {
    selector: stableSelector(el),
    text: visibleText(el),
    ids,
    rect: {
      x: Math.round(r.left + (view?.scrollX ?? 0)),
      y: Math.round(r.top + (view?.scrollY ?? 0)),
      width: Math.round(r.width),
      height: Math.round(r.height),
    },
  };
}
