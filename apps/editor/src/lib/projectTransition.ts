import { useProjectTransitionStore } from "@/store/useProjectTransitionStore.js";

export async function transitionToEditor(navigate: () => void | Promise<void>): Promise<void> {
  await useProjectTransitionStore.getState().runOpening(navigate);
}

export async function transitionToHome(
  close: () => void,
  navigate: () => void | Promise<void>,
): Promise<void> {
  await useProjectTransitionStore.getState().runClosing(() => {
    close();
    void navigate();
  });
}
