// GET /admin/feedback/shot/<id>[/element]: a feedback screenshot, to the
// admin only. Everyone else, signed in or not, gets a plain 404, so nothing
// hints that the item exists. Answered before the admin page gate, which
// would send a signed-out visitor to sign in.
import { isFeedbackImageKey } from "~/core/feedback";
import { FeedbackIdSchema } from "~/core/schema/feedback";
import type { AuthEnv } from "../auth/config";
import { getSession } from "../auth/session";
import { getFeedback } from "./store";

export const FEEDBACK_SHOT_PREFIX = "/admin/feedback/shot/";

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function serveFeedbackShot(
  request: Request,
  env: AuthEnv,
  now: Date,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return notFound();
  const [rawId, which, ...rest] = new URL(request.url).pathname
    .slice(FEEDBACK_SHOT_PREFIX.length)
    .split("/");
  const id = FeedbackIdSchema.safeParse(rawId);
  if (
    !id.success ||
    rest.length > 0 ||
    (which !== undefined && which !== "element")
  )
    return notFound();
  const bucket = env.USER_CONTENT;
  if (!bucket) return notFound();
  // Read-only: an <img> load never refreshes the session.
  const session = await getSession(request, env, now);
  if (!session?.user.isAdmin) return notFound();
  const row = await getFeedback(env.DB, id.data);
  const key = which === "element" ? row?.element_shot_key : row?.screenshot_key;
  if (!key || !isFeedbackImageKey(key)) return notFound();
  const object = await bucket.get(key);
  const type = object?.httpMetadata?.contentType;
  if (!object || !type?.startsWith("image/")) return notFound();
  return new Response(request.method === "HEAD" ? null : object.body, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(object.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
