// The one way out when only a newer version of Terpsicle can help (a deploy
// removed a file this tab needs, or the server speaks a newer format): a
// Reload button beside the words, never "reload the page" alone
// (docs/COHESION.md, Phase 4). Plans and settings are saved, so nothing's lost.

/** What the Reload button's tooltip says, unless the place says more. */
export const RELOAD_TOOLTIP = "Reload Terpsicle to get the new version";

/** Loads the page again, with the newest version of Terpsicle. */
export function reloadPage(): void {
  window.location.reload();
}
