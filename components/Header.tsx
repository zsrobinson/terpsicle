'use client';

import Link from "next/link";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGraduationCap } from '@fortawesome/free-solid-svg-icons';
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export default function Header() {
  const pathname = usePathname();
  
  return (
    <header className="bg-[#1e1e1e] px-8 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon 
            icon={faGraduationCap}
            className="text-[#E03131] text-2xl"/>
          <Link href="/" prefetch>
            <h1 className="text-2xl font-bold text-[#E03131]">
              Terpsicle
            </h1>
          </Link>
        </div>
        
        <div className="flex items-center gap-6">
          <nav className="flex gap-6 items-center">
            <Navlink href="/degree" pathname={pathname}>
              <span className="font-medium text-white">Degree</span>
            </Navlink>
            <Navlink href="/schedule" pathname={pathname}>
              <span className="font-medium text-white">Schedule</span>
            </Navlink>
          </nav>
          
          <Link 
            href="/schedule" 
            className="bg-[#E03131] text-white px-4 py-2 rounded-full hover:bg-[#c92a2a] transition-colors duration-200 font-medium"
          >
            Enter App
          </Link>
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
        className={`transition-transform duration-200 hover:scale-110 ${pathname.includes(href) ? "font-semibold" : ""}`}
        prefetch
      >
        {children}
      </Link>
    );
  }
} 

