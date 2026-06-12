import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { App } from "./games/silent-archive/App.js";
import { AppSettingsProvider } from "./engine/context/AppSettings.js";
import { ModalProvider } from "./games/silent-archive/context/ModalContext.js";
import i18n from "./i18n/index.js";
import { bundleStore, type BundleLoadProgress } from "./engine/lib/bundleStore.js";
import { setEngineTranslator } from "./engine/lib/localization.js";

setEngineTranslator((key, options) => i18n.t(key, options));

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}
const appRoot = rootElement;

const preloader = document.getElementById("bb-preloader");
const preloaderBar = document.getElementById("bb-preloader-bar");

function initPreloaderCopy(): void {
  if (!preloader) return;
  preloader.setAttribute("aria-label", i18n.t("preloader.loading"));
  const label = preloader.querySelector<HTMLElement>(".bb-preloader-label");
  const sublabel = preloader.querySelector<HTMLElement>(".bb-preloader-sublabel");
  if (label) label.textContent = i18n.t("preloader.label");
  if (sublabel) sublabel.textContent = i18n.t("preloader.sublabel");
  document.title = i18n.t("header.brand");
}

initPreloaderCopy();

function onBundleProgress({ received, total }: BundleLoadProgress): void {
  if (!preloaderBar || total === 0) return;
  const pct = Math.min(100, (received / total) * 100);
  preloaderBar.style.width = `${pct.toFixed(1)}%`;
}

function hidePreloader(): void {
  if (!preloader) return;
  preloader.style.opacity = "0";
  setTimeout(() => preloader.remove(), 450);
}

function renderApp(): void {
  hidePreloader();
  createRoot(appRoot).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <AppSettingsProvider>
          <ModalProvider>
            <App />
          </ModalProvider>
        </AppSettingsProvider>
      </I18nextProvider>
    </StrictMode>,
  );
}

function renderBootError(error: unknown): void {
  if (preloader) {
    const label = preloader.querySelector<HTMLElement>(".bb-preloader-label");
    const bar = preloader.querySelector<HTMLElement>(".bb-preloader-progress");
    if (label) {
      label.textContent =
        error instanceof Error ? error.message : i18n.t("errors.bundleLoadFailed");
      label.style.color = "var(--color-danger, #e82020)";
    }
    if (bar) bar.style.display = "none";
    const dots = preloader.querySelectorAll<HTMLElement>(".boot-dot");
    dots.forEach((d) => (d.style.background = "var(--color-danger, #e82020)"));
    return;
  }
  const detail = error instanceof Error ? error.message : String(error);
  appRoot.textContent = i18n.t("errors.bundleLoadFailedDetail", { detail });
}

bundleStore.load("/bundle/", onBundleProgress).then(renderApp).catch(renderBootError);
