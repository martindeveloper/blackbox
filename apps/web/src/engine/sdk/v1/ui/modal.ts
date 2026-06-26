// @engine/sdk/v1/ui/modal - modal API (Blackbox engine API v1).
import { useModal as useModalInternal } from "@engine/ui/ModalContext.js";
import type {
  ModalDescriptor as ModalDescriptorInternal,
  ModalSize as ModalSizeInternal,
  ModalTone as ModalToneInternal,
} from "@engine/ui/ModalContext.js";

export type ModalDescriptor = ModalDescriptorInternal;
export type ModalSize = ModalSizeInternal;
export type ModalTone = ModalToneInternal;
export type ModalApi = ReturnType<typeof useModalInternal>;

export function useModal(): ModalApi {
  return useModalInternal();
}
