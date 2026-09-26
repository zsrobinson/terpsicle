// Finding links in free text. A link to UMD (or to us) is fine anywhere; any
// other link is a spam and phishing risk, and a few sites are mostly used to
// trade answers to graded work.

export interface FoundLink {
  host: string;
  span: [number, number];
}

const TLDS =
  "com|net|org|edu|gov|io|co|us|me|ly|gg|app|dev|ai|xyz|info|biz|link|site|online|tv|to|sh|so|page|cc";

// A scheme or www. link, or a bare domain with a common TLD. The lookbehind
// keeps the domain of an email address from counting as a link.
const LINK = new RegExp(
  `https?:\\/\\/[^\\s<>()"']+|\\bwww\\.[^\\s<>()"']+|(?<![@\\w.-])(?:[a-z0-9-]+\\.)+(?:${TLDS})\\b(?:\\/[^\\s<>()"']*)?`,
  "gi",
);

const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;

/** Hosts that are always fine: UMD and Terpsicle, with their subdomains. */
export const ALLOWED_LINK_DOMAINS = ["umd.edu", "terpsicle.com"] as const;

/** Sites whose main use in a class is trading answers. Links to them are held. */
export const CHEATING_DOMAINS = [
  "chegg.com",
  "coursehero.com",
  "studocu.com",
  "brainly.com",
  "numerade.com",
] as const;

const within = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

export function hostOf(link: string): string {
  const host = link.replace(/^https?:\/\//i, "").split(/[/?#:]/, 1)[0] ?? "";
  return host
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

export function findLinks(text: string): FoundLink[] {
  const found: FoundLink[] = [];
  for (const match of text.matchAll(LINK)) {
    const raw = match[0].replace(TRAILING_PUNCTUATION, "");
    found.push({
      host: hostOf(raw),
      span: [match.index, match.index + raw.length],
    });
  }
  return found;
}

export const isAllowedHost = (host: string) =>
  ALLOWED_LINK_DOMAINS.some((d) => within(host, d));

export const isCheatingHost = (host: string) =>
  CHEATING_DOMAINS.some((d) => within(host, d));
