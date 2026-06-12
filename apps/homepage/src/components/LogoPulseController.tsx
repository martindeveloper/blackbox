"use client";

import { useEffect } from "react";

const PULSE_DURATION_MS = 5000;
const FIRST_PULSE_MIN_MS = 3000;
const FIRST_PULSE_MAX_MS = 5000;
const NEXT_PULSE_MIN_MS = 7000;
const NEXT_PULSE_MAX_MS = 14000;

function randomDelay(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

export function LogoPulseController() {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let pulseTimer: ReturnType<typeof setTimeout> | undefined;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    const schedulePulse = (min: number, max: number) => {
      pulseTimer = setTimeout(
        () => {
          root.classList.add("logo-pulse-active");
          resetTimer = setTimeout(() => {
            root.classList.remove("logo-pulse-active");
            schedulePulse(NEXT_PULSE_MIN_MS, NEXT_PULSE_MAX_MS);
          }, PULSE_DURATION_MS);
        },
        randomDelay(min, max),
      );
    };

    if (!reducedMotion.matches) {
      schedulePulse(FIRST_PULSE_MIN_MS, FIRST_PULSE_MAX_MS);
    }

    return () => {
      if (pulseTimer) clearTimeout(pulseTimer);
      if (resetTimer) clearTimeout(resetTimer);
      root.classList.remove("logo-pulse-active");
    };
  }, []);

  return null;
}
