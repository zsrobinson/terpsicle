// The ELMS calendar feed link is a secret (docs/V3.md §3.2, §5.1): only its
// exact shape is accepted, on the browser and again on the server, and the
// answer to a bad one never echoes it.

/** The only hosts a feed, a redirect or an item link may be on. */
export const ELMS_HOSTS: readonly string[] = [
  "elms.umd.edu",
  "umd.instructure.com",
];

/**
 * The feed link in its one accepted form,
 * `https://<ELMS host>/feeds/calendars/user_<token>.ics`, or null. `webcal://`
 * (which some browsers copy) becomes `https://`. Scheme and host are
 * case-insensitive, like any URL's; nothing else varies: no other host, port,
 * credentials, path, query or fragment passes.
 */
export function parseFeedLink(input: string): string | null {
  const match = /^(?:https|webcal):\/\/([^/]*)(\/.*)$/i.exec(input.trim());
  const host = match?.[1]?.toLowerCase() ?? "";
  if (!ELMS_HOSTS.includes(host)) return null;
  const path = /^\/feeds\/calendars\/user_[A-Za-z0-9]{20,80}\.ics$/.exec(
    match?.[2] ?? "",
  );
  return path ? `https://${host}${path[0]}` : null;
}

/** Whether a URL is plain https on an ELMS host (no port or credentials): a redirect we'll follow, or an item link we'll show. */
export function isElmsUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    ELMS_HOSTS.includes(parsed.hostname) &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === ""
  );
}
