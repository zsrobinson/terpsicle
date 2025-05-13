import { ReactNode } from "react";
import {
  Tooltip as BaseTooltip,
  TooltipContent,
  TooltipTrigger,
} from "./tooltip";

export function Tooltip({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  return (
    <BaseTooltip delayDuration={500}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        className="mt-2 bg-secondary-foreground text-secondary"
        side="bottom"
      >
        <p>{text}</p>
      </TooltipContent>
    </BaseTooltip>
  );
}
