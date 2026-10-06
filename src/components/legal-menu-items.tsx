import { LockKeyhole, ScrollText } from "lucide-react";
import { ActionMenuLinkItem } from "~/ui/action-menu";

// Privacy and Terms of use as menu items: the product menu's foot (and the
// phone account menu's, which carries that foot), and the desktop account
// menu's. Plain links, as About Terpsicle is: the shell also renders
// outside a router (tests).

export function LegalMenuItems({ icons = false }: { icons?: boolean }) {
  return (
    <>
      <ActionMenuLinkItem
        href="/privacy"
        tooltip="What Terpsicle keeps about you, and why"
        icon={
          icons ? (
            <LockKeyhole aria-hidden="true" className="text-muted" />
          ) : undefined
        }
      >
        Privacy
      </ActionMenuLinkItem>
      <ActionMenuLinkItem
        href="/terms"
        tooltip="The rules for using Terpsicle"
        icon={
          icons ? (
            <ScrollText aria-hidden="true" className="text-muted" />
          ) : undefined
        }
      >
        Terms of use
      </ActionMenuLinkItem>
    </>
  );
}
