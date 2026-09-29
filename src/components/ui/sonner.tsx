import { Toaster as Sonner, type ToasterProps } from "sonner";
import { NOTE_MS } from "~/ui/toast";

// Pop-up messages (undo, errors). Themed from our tokens; `theme="system"`
// only picks sonner's icon set, colors come from the CSS variables. Sonner's
// own stylesheet sets a system font stack and roomy padding, so the app font
// and the prototype's compact toast (12.5px, py-2 pr-2 pl-3) are forced here.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="bottom-center"
      // Twice sonner's default, so a message can be read to the end (WCAG
      // 2.2.1); hovering holds it. Undo toasts set their own (`~/ui/toast`).
      duration={NOTE_MS}
      // Above a workbench drawer on a phone, at rest or half open, not over
      // its tabs or panel: styles.css sets --toast-lift while one is there.
      // Elsewhere, clear of the home indicator and Safari's toolbar.
      offset={{ bottom: "var(--toast-lift, calc(24px + var(--safe-bottom)))" }}
      mobileOffset={{
        bottom: "var(--toast-lift, calc(16px + var(--safe-bottom)))",
      }}
      toastOptions={{
        classNames: {
          toast:
            "font-sans! bg-raised! text-fg! border-keyline! shadow-pop! text-base! rounded-none! gap-3! py-2! pr-2! pl-3! items-center!",
          title: "font-normal! leading-snug!",
          description: "text-muted! text-sm!",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
