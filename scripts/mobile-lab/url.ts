// `--url` names a deployment (https://terpsicle.com, a PR preview, localhost);
// the scenarios drive the scheduler, which lives at /schedule. A fresh phone
// on / would get the marketing page instead.

/** The scheduler on the given deployment; a URL with its own path is kept. */
export function schedulerUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.pathname === "/") parsed.pathname = "/schedule";
  return parsed.href;
}
