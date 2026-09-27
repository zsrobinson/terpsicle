import type { JSX } from "react";
import type { PageHead } from "~/core/seo";

/**
 * A page's head (~/core/seo) as a route's `head()` returns it. The router
 * renders `{"script:ld+json": …}` meta entries as escaped JSON-LD scripts
 * (router-core's MetaDescriptor), but React Router's `head` type lists only
 * <meta> attributes, so this one cast says what the runtime does.
 */
export function routeHead(head: PageHead): {
  meta: JSX.IntrinsicElements["meta"][];
  links: JSX.IntrinsicElements["link"][];
} {
  return head as unknown as {
    meta: JSX.IntrinsicElements["meta"][];
    links: JSX.IntrinsicElements["link"][];
  };
}
