import { FlameKindlingIcon, GraduationCap } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-secondary dark:bg-card border-t py-4 mt-32">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="text-primary" size={32} />
            <span className="text-xl font-semibold">Terpsicle</span>
          </div>
        </div>

        <p className="text-center text-muted-foreground ml-3">
          Created at Bitcamp 2025
          <FlameKindlingIcon
            className="text-primary-foreground inline ml-1 mb-1"
            size={20}
          />
        </p>
      </div>
    </footer>
  );
}
