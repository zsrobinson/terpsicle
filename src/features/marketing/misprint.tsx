import type { ReactNode } from "react";

/**
 * A heading with a second impression behind it, slightly off register in
 * `className`'s color, that settles into place (marketing.css). The
 * duplicate is decoration: hidden from assistive tech, and gone once it
 * has settled or under reduced motion.
 */
export function Misprint({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span className="mk-mis">
      <span aria-hidden="true" className={`mk-mis-layer ${className}`}>
        {children}
      </span>
      <span className="mk-mis-text">{children}</span>
    </span>
  );
}
