import { Toaster as Sonner, type ToasterProps } from "sonner";

// Pop-up messages (undo, errors). Themed from our tokens; `theme="system"`
// only picks sonner's icon set, colors come from the CSS variables.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "bg-raised! text-fg! border-hairline! shadow-pop! text-[13px]! rounded-lg!",
          description: "text-muted!",
          actionButton: "bg-accent! text-accent-fg!",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
