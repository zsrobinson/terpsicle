'use client';

import Link from "next/link";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGraduationCap } from '@fortawesome/free-solid-svg-icons';
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export default function Header() {
  const pathname = usePathname();
  return (
    <header className="bg-[#d7cdcc] px-8 py-4 shadow-sm border-b border-[#E03131]/20">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon 
            icon={faGraduationCap}
            className="text-[#E03131] text-2xl"/>
          <Link href="/" prefetch>
            <h1 className="text-2xl font-bold text-[#1B2B4B]">
              Terpsicle
            </h1>
          </Link>
        </div>
        
        <nav className="flex gap-6 items-center">
          <Navlink href="/degree" pathname={pathname}>
            <span className="text-lg font-medium text-[#6686c6]">Degree</span>
          </Navlink>
          <Navlink href="/schedule" pathname={pathname}>
            <span className="text-lg font-medium text-[#6686c6]">Schedule</span>
          </Navlink>
        </nav>
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
        className={`px-3 py-1 rounded-md transition-transform duration-200 hover:scale-110 ${pathname.includes(href) ? "font-semibold border-b-2 border-[#6686c6]" : ""}`}
        prefetch
      >
        {children}
      </Link>
    );
  }
} 

