'use client';

import Link from "next/link";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGraduationCap } from '@fortawesome/free-solid-svg-icons';
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export default function Header() {
  const pathname = usePathname();
  return (
    <header className="fixed top-0 left-0 right-0 bg-[#d7cdcc]/99 backdrop-blur-md px-6 py-2 z-20 shadow-md border-b border-[#E03131]/20">
      <div className="flex items-center gap-2 max-w-7xl mx-auto">
        <FontAwesomeIcon 
          icon={faGraduationCap}
          className="text-[#E03131] text-2xl"/>
      
      <nav className="flex gap-4 items-center">
      <Link href="/" prefetch>
      <h1 className="text-2xl font-bold text-[#1B2B4B]">
          Terpsicle
        </h1>
      </Link>
      <Navlink href="/degree" pathname={pathname}>
      <h2 className="text-2l font-bold text-[#1B2B4B]"> Degree </h2>
      </Navlink>
      <Navlink href="/schedule" pathname={pathname}>
      <h2 className="text-2l font-bold text-[#1B2B4B]"> Schedule </h2>
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
        className={`leading-none ${pathname.includes(href) ? "underline" : ""}`}
        prefetch
      >
        {children}
      </Link>
    );
  }
} 

