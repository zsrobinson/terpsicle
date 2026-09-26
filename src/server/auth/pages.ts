// Who may load a page, for the few pages that aren't for everyone. Today
// that's the admin panel (V2 §10): the owner sees it; anyone else signed in
// gets the site's plain "Page not found" (a real 404, so nothing hints that
// it exists); a signed-out visitor is sent to sign in and brought back.
// The panel's API routes check again (`auth: "admin"`), so this only decides
// which HTML to send.
import { isAdminPath } from "~/core/routing";
import type { AuthEnv } from "./config";
import { getSession } from "./session";

export type PageAccess = "allow" | "sign-in" | "not-found";

/** null for pages anyone may load; otherwise what to do with this request. */
export async function pageAccess(
  request: Request,
  env: AuthEnv,
  now: Date,
): Promise<PageAccess | null> {
  if (!isAdminPath(new URL(request.url).pathname)) return null;
  // Read-only: page loads never refresh the session (POST /api/me does).
  const session = await getSession(request, env, now);
  if (!session) return "sign-in";
  return session.user.isAdmin ? "allow" : "not-found";
}
