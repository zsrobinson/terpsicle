"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 items-center">
      <Link href="/" prefetch>
        <h1 className="text-2xl font-semibold leading-none mr-4">Terpsicle</h1>
      </Link>
      <Navlink href="/degree" pathname={pathname}>
        Degree
      </Navlink>
      <Navlink href="/schedule" pathname={pathname}>
        Schedule
      </Navlink>
    </nav>
  );
}

function Navlink({
  href,
  pathname,
  children,
}: {
  href: string;
  pathname: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`leading-none ${pathname.includes(href) ? "underline" : ""}`}
      prefetch
    >
      {children}
    </Link>
  );
}
