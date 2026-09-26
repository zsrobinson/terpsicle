// A Riso misregistration: the words printed twice, the second impression in
// the product's lighter color, a few pixels off, settling into register as
// the words arrive (marketing.css). Screen readers hear the words once.

export function Misprint({
  children,
  className,
}: {
  children: string;
  /** The second impression's color (`text-product-<id>-mis`). */
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
