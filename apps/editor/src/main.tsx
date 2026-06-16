import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import { OverlayProviders } from "./context/OverlayProviders.js";
import { ThemeProvider } from "./context/ThemeContext.js";
import { UserPrefsProvider } from "./hooks/useUserPrefs.js";
import { CliStagingBanner } from "./components/layout/CliStagingBanner.js";
import { router } from "./router.js";
import i18n from "./i18n/index.js";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <UserPrefsProvider>
          <ThemeProvider>
            <OverlayProviders>
              <RouterProvider router={router} />
              <CliStagingBanner />
            </OverlayProviders>
          </ThemeProvider>
        </UserPrefsProvider>
      </I18nextProvider>
    </StrictMode>,
  );
}
