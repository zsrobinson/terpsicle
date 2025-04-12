"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="px-8 py-3 bg-secondary">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon
            icon={faGraduationCap}
            className="text-primary text-2xl"
          />
          <Link href="/" prefetch>
            <h1 className="text-2xl font-bold">Terpsicle</h1>
          </Link>
        </div>

        <div className="flex items-center gap-6">
          <nav className="flex gap-6 items-center">
            <Navlink href="/degree" pathname={pathname}>
              Degree
            </Navlink>

            <Navlink href="/schedule" pathname={pathname}>
              Schedule
            </Navlink>
          </nav>
        </div>
      </div>
    </header>
  );

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
        className={`font-medium ${pathname.includes(href) ? "underline" : ""}`}
        prefetch
      >
        {children}
      </Link>
    );
  }
}
