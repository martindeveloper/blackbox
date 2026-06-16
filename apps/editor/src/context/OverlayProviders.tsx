import type { ReactNode } from "react";
import { ProjectTransitionOverlay } from "../components/transitions/ProjectTransitionOverlay.js";
import { UpdateBanner } from "../components/overlay/UpdateBanner.js";
import { ModalProvider } from "./ModalProvider.js";
import { NotificationProvider } from "./NotificationProvider.js";

export function OverlayProviders({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <ModalProvider>
        {children}
        <ProjectTransitionOverlay />
        <UpdateBanner />
      </ModalProvider>
    </NotificationProvider>
  );
}
