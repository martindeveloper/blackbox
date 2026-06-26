// @engine/sdk/v1/hooks/resolution - resolution-presentation hook (Blackbox engine API v1).
import { useResolutionPresentation as useResolutionPresentationInternal } from "@engine/hooks/useResolutionPresentation.js";
import type {
  SequencePhase as SequencePhaseInternal,
  DamagePulse as DamagePulseInternal,
} from "@engine/hooks/useResolutionPresentation.js";

export type SequencePhase = SequencePhaseInternal;
export type DamagePulse = DamagePulseInternal;
// Derived owned names for the option/result shapes (the internal types are unnamed).
export type ResolutionPresentationOptions = Parameters<typeof useResolutionPresentationInternal>[0];
export type ResolutionPresentationResult = ReturnType<typeof useResolutionPresentationInternal>;

export function useResolutionPresentation(
  options: ResolutionPresentationOptions,
): ResolutionPresentationResult {
  return useResolutionPresentationInternal(options);
}
