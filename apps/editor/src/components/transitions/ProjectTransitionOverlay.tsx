import { useProjectTransitionStore } from "@/store/useProjectTransitionStore.js";

export function ProjectTransitionOverlay() {
  const phase = useProjectTransitionStore((s) => s.phase);
  if (phase === "idle") return null;

  return <div className={`project-transition project-transition--${phase}`} aria-hidden="true" />;
}
