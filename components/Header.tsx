'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGraduationCap } from '@fortawesome/free-solid-svg-icons';

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 bg-[#FAB6B6]/70 backdrop-blur-md px-6 py-2 z-20 shadow-md border-b border-[#E03131]/20">
      <div className="flex items-center gap-2 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-[#1B2B4B]">
          Terpsicle
        </h1>
        <FontAwesomeIcon 
          icon={faGraduationCap}
          className="text-[#E03131] text-2xl"/>
      </div>
    </header>
  );
} 
