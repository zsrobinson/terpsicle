# Feedback

How people tell us what's broken or missing, and how the owner leaves notes on a deployment. The owner's rules are in `docs/decisions.md` ("Feedback without surveillance", "Pinned notes for the owner"); the words are in `CONTEXT.md`.

## Where it is

**Send feedback** is in the scheduler's top bar, before the account button, and in the header of every product page (Reviews, Chat, Plan, Todo, Settings), never on `/` or `/privacy` (`feedbackProduct` in `src/core/feedback/path.ts`). On desktop it's an icon and "Feedback" and opens a popover; on phones it's the icon alone and opens a drawer, except on the scheduler, whose phone bar is full: there it's an item in the account menu. Only the button loads with the page (`src/features/feedback/feedback-button.tsx`); the sheet, the screenshot code (`modern-screenshot`) and the admin's pins load on first hover or focus (`scripts/check-bundle.ts`). Closing the sheet keeps the draft in memory; after sending, the toast's Undo calls `feedback/undo` and puts the words back.

## What's sent

The feedback sheet has two kinds, picked first: **Report a bug** ("What happened?", and an optional "What did you expect?") and **Suggest a feature** ("What would help?"). Two checkboxes, on by default:

- **Include what I was doing** adds the context (`FeedbackContextSchema` in `src/core/schema/feedback.ts`): the app version, browser, screen and window size, online state, theme, the route pattern, the person's current plan (courses, sections, bookmarks, block labels), their settings, and the activity log, the last ~50 app actions: route changes (pattern only), app events (what `track()` sends), errors with their stacks, and failed API calls (method, route, status; never a body). The log lives in the page's memory and leaves only when someone sends feedback. Routes are scrubbed like analytics and anything shaped like a link or token in its text is redacted (`sanitizeContext`), in the browser and again in the Worker.
- **Include a screenshot** adds one image of the page. Every `data-private` element (names, pictures, other people's words, block labels) is hidden in the copy and painted over as a solid box before the image exists (`src/features/feedback/screenshot.ts`). The window and every scrolled panel keep their scroll; route maps give a frame from their own render (or a flat "Map" box). WebP at 0.85 (PNG where the browser can't write WebP), at most 2,560 px wide at up to 2× the pixel ratio. A small editor blacks out or crops more (`src/core/feedback/redact.ts`), and "Choose an image instead" redraws the file through a canvas, which drops its EXIF.

Signed-in people also get **You can reply by email**, off by default. Only then is their user id stored with the item, so marking it Fixed can email them once.

**Never sent:** secrets (the ELMS feed link, session and auth tokens, push endpoints, a share link's plan), other people's words (classmates' messages, other people's reviews), and grades from a pasted transcript. Paths are scrubbed like analytics (`scrubUrl`): a share link becomes `plan=shared`, a chat room's path its pattern.

## Pinned notes

Admins get a third mode in the sheet, **Pin a note**: hover outlines elements, a click opens a note box beside one, and the note stores the element (a stable selector, its visible text, its `data-*` ids and where it was), a cropped screenshot of it and one of the viewport, the page with its search params, viewport, theme, app version and the deployment's host. They land in the inbox as kind `review`. On the page they show as numbered dots, to admins only, on their route only.

## Storage

- **D1** `feedback` (migration `0012_feedback.sql`): kind, product, scrubbed path, text, expected, image keys, context and element JSON, host, `user_id` (only for a reply, or the admin's own note), status (`new`, `planned`, `fixed`, `wont-fix`, `spam`), group, the owner's note, the undo hash, `replied_at`, `deleted_at` and timestamps. `feedback_groups` holds the model's summary for a group of similar items.
- **R2** `USER_CONTENT` at `feedback/<yyyy-mm>/<id>.<ext>` (and `<id>-element.<ext>`), served only to the admin at `/admin/feedback/shot/<id>[/element]` with `private, no-store`, `nosniff` and `default-src 'none'`; everyone else gets a 404. The Worker stores an image only when its bytes are really a WebP, PNG or JPEG of the type sent, at most 4,096 px a side and 2 MB.

## The API

| Route | Who | Limits |
|---|---|---|
| `feedback/send` → `{id, undoToken}` | anyone; same origin; reads the session when there is one | 12 per IP, 20 per person an hour; 3 MB |
| `feedback/undo {id, undoToken}` | the sender, within 10 minutes | 30 per IP |
| `feedback/pin`, `feedback/pins {pathname}` | admin | |
| `admin/feedback/list`, `admin/feedback/update`, `admin/feedback/delete` | admin | |

Marking an item Fixed emails the person once, from the seat-alert address, when they asked for a reply (never on previews, which have no `EMAIL` binding). A delete is soft for 10 seconds so the toast's Undo works (`restore: true`); after that the item is hidden for good and removed with its images by the next delete or the daily job, whichever comes first. The server event `feedback_received` carries the kind, product and which boxes were on, never the words.

## Retention

The daily job (`pruneFeedback`):

- undo tokens are cleared 10 minutes after sending;
- screenshots go 180 days after sending, or 30 days after the item is closed (Fixed, Won't fix or Spam), whichever is sooner;
- items go a year after sending;
- a purged account's items stay, without its user id.
