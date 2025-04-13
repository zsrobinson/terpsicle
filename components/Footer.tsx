import { faFireFlameCurved, faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function Footer() {
  return (
    <footer className="bg-secondary py-4">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 mb-3">
            <FontAwesomeIcon
              icon={faGraduationCap}
              className="text-primary text-2xl"
            />
            <span className="text-xl font-semibold">Terpsicle</span>
          </div>
        </div>

        <div className="text-center text-muted-foreground">
          <p>
            © 2025 Terpsicle. Made at BITCAMP{" "}
            <FontAwesomeIcon
              icon={faFireFlameCurved}
              className="text-primary"
            />
          </p>
        </div>
      </div>
    </footer>
  );
} 