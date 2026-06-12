import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import { OverlayProviders } from "./context/OverlayProviders.js";
import { ThemeProvider } from "./context/ThemeContext.js";
import { router } from "./router.js";
import i18n from "./i18n/index.js";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          <OverlayProviders>
            <RouterProvider router={router} />
          </OverlayProviders>
        </ThemeProvider>
      </I18nextProvider>
    </StrictMode>,
  );
}
