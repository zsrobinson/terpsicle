// PROTOTYPE: final design review page (separate artifact from the variant switcher).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { ReviewPage } from "./review/page";

createRoot(document.getElementById("root")!).render(<StrictMode><ReviewPage /></StrictMode>);
