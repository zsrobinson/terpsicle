import { INLINE_SCRIPTS } from "virtual:terpsicle/inline-scripts";
import type { InlineScriptName } from "./inline-scripts";

/**
 * One of the document's inline scripts (inline-scripts.ts), as the build
 * made it, so its text matches the hash in the Worker's CSP.
 */
export function InlineScript({ name }: { name: InlineScriptName }) {
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time constant text from inline-scripts.ts, allowed by hash in the CSP
    <script dangerouslySetInnerHTML={{ __html: INLINE_SCRIPTS[name] }} />
  );
}
