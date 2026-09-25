import { Toaster as Sonner, type ToasterProps } from "sonner";

// Pop-up messages (undo, errors). Themed from our tokens; `theme="system"`
// only picks sonner's icon set, colors come from the CSS variables. Sonner's
// own stylesheet sets a system font stack and roomy padding, so the app font
// and the prototype's compact toast (12.5px, py-2 pr-2 pl-3) are forced here.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "font-sans! bg-raised! text-fg! border-hairline! shadow-pop! text-[12.5px]! rounded-lg! gap-3! py-2! pr-2! pl-3! items-center!",
          title: "font-normal! leading-snug!",
          description: "text-muted! text-[12px]!",
          actionButton: "bg-accent! text-accent-fg!",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
