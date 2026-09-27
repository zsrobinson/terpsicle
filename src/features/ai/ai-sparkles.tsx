import { type LucideProps, Sparkles } from "lucide-react";
import { useAiFeatures } from "./use-ai-features";

/**
 * The sparkles, which mark what a model wrote (DESIGN.md §5), and the only
 * way to draw them outside the admin panel: they show only while AI features
 * are on (`useAiFeatures`). sparkles-guard.test.ts keeps it that way.
 */
export function AiSparkles(props: LucideProps) {
  const { on } = useAiFeatures();
  if (on !== true) return null;
  return <Sparkles {...props} />;
}
