import { useRouterState } from "@tanstack/react-router";
import { HOME_PATH, type TabId, tabBarAt } from "~/core/routing";
import { useAccount } from "~/features/auth/account-store";
import { listedProducts, productLink } from "~/lib/products";
import { TabBarItem } from "~/ui/tab-bar-item";
import { Mark } from "./brand/mark";

// The phone's tab bar (CONTEXT.md, "Tab bar"; docs/decisions.md, "Phones get
// a tab bar"): below `md`, Home and the five products along the bottom
// edge, six labeled tabs edge to edge with their marks always in color, the
// one you're on tinted. It replaces the family bar's product menu there;
// desktops keep the family bar's tabs. `tabBarAt` says which pages have it.
//
// It's mounted once, beside the sheet indent rather than inside it (the
// root layout), so a page scaling back under a sheet leaves it where it is
// (the sheet's backdrop dims it), and a fixed bar in a scrolling page never
// moves. styles.css steps it aside while the workbench drawer is pulled all
// the way up (`<html data-drawer-snap="full">`), while a text field has the
// keyboard up, and where a page says so (`data-hides-tab-bar`, a Chat
// room); and it sets `--tab-bar-height` and `--tab-bar-space` for
// everything anchored to the bottom (the drawer's peek, toasts, pages).
// Reviews opens PlanetTerp in a new tab while our pages are off, as the
// family bar's purple tab does (~/lib/products, `productLink`).

/** The current tab's soft color, as the desktop's tabs wear it. */
const CURRENT: Record<TabId, string> = {
  home: "bg-accent-soft",
  schedule: "bg-product-schedule-soft",
  reviews: "bg-product-reviews-soft",
  chat: "bg-product-chat-soft",
  plan: "bg-product-plan-soft",
  todo: "bg-product-todo-soft",
};

export function TabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const flags = useAccount((s) => s.flags);
  const place = tabBarAt(pathname);
  if (!place) return null;
  const here = place.current === "home" ? null : place.current;
  return (
    <nav
      aria-label="Tab bar"
      data-tab-bar=""
      className="fixed inset-x-0 bottom-0 z-40 border-hairline border-t bg-bg pr-(--safe-right) pb-(--safe-bottom) pl-(--safe-left) md:hidden"
    >
      <ul className="flex h-12.5 items-center gap-px px-0.5">
        <li className="flex min-w-0 flex-1">
          <TabBarItem
            to={HOME_PATH}
            label="Home"
            tooltip="Home"
            icon={<Mark id="umbrella" size={30} />}
            current={place.current === "home"}
            currentClassName={CURRENT.home}
            onReselect={toTop}
          />
        </li>
        {listedProducts(flags, here).map((p) => {
          const link = productLink(p, flags, here);
          return (
            <li key={p.id} className="flex min-w-0 flex-1">
              <TabBarItem
                to={link.href}
                outside={link.outside ? "PlanetTerp" : undefined}
                label={p.label}
                tooltip={link.outside ? link.tooltip : p.view}
                icon={<Mark id={p.id} size={30} />}
                current={place.current === p.id}
                currentClassName={CURRENT[p.id]}
                onReselect={toTop}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The tab you're on, tapped again: back to the top of the page, and of
 * whatever has scrolled inside it (Chat's list, Plan's semesters), as a
 * phone's own tab bars do. The workbench drawer keeps its place.
 */
function toTop() {
  const behavior: ScrollBehavior = matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches
    ? "auto"
    : "smooth";
  window.scrollTo({ top: 0, behavior });
  const main = document.querySelector("main");
  if (!main) return;
  for (const el of [main, ...main.querySelectorAll<HTMLElement>("*")])
    if (el.scrollTop > 0 && !el.closest("[data-workbench-drawer]"))
      el.scrollTo({ top: 0, behavior });
}
