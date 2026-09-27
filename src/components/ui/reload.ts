// The one way out when only a newer version of Terpsicle can help (a deploy
// removed a file this tab needs, or the server speaks a newer format): a
// Reload button beside the words, never "reload the page" alone
// (docs/COHESION.md, Phase 4). Plans and settings are saved, so nothing's lost.

/** What the Reload button's tooltip says, unless the place says more. */
export const RELOAD_TOOLTIP = "Reload Terpsicle to get the new version";

/**
 * Where Reload goes: this page, or `href` when the address has moved on
 * since (a shared link the app has already taken out of the URL).
 */
export type ReloadTarget = true | { href: string };

/** Loads the page again, with the newest version of Terpsicle. */
export function reloadPage(target: ReloadTarget = true): void {
  if (target === true) window.location.reload();
  else window.location.assign(target.href);
}
