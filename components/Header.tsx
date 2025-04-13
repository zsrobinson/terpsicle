"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { GraduationCapIcon } from "lucide-react";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="px-8 py-2 bg-secondary border-b">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <GraduationCapIcon className="text-primary" size={32} />
          <Link href="/" prefetch>
            <h1 className="text-2xl font-bold">Terpsicle</h1>
          </Link>
        </div>

        <div className="flex items-center gap-6">
          <nav className="flex gap-6 items-center">
            <Navlink href="/degree" pathname={pathname}>
              Yearly Planner
            </Navlink>
            <Navlink href="/audit" pathname={pathname}>
              Audit
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
        className={`font-medium relative transition-colors
        ${
          pathname.includes(href)
            ? "text-primary underline underline-offset-4"
            : "hover:text-primary group"
        }`}
        prefetch
      >
        {children}
        {!pathname.includes(href) && (
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
        )}
      </Link>
    );
  }
}
