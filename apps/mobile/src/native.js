/**
 * Native-feel layer for the Capacitor shell.
 *
 * Injected into the web player's index.html (see scripts/sync-web.mjs) and loaded
 * BEFORE the app bundle. It is a hard no-op on the web — every line is gated on
 * Capacitor.isNativePlatform() — so the same dist serves browser and app.
 *
 * Uses the global `window.Capacitor.Plugins` that the native runtime injects, so
 * there is nothing to bundle or transpile. Keep it tiny and dependency-free.
 */
(function () {
  "use strict";

  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== "function" || !Cap.isNativePlatform()) {
    return;
  }

  var P = Cap.Plugins || {};
  var SplashScreen = P.SplashScreen;
  var Haptics = P.Haptics;
  var App = P.App;

  // Capacitor core (unlike Ionic) does NOT add .ios/.md classes to <html>, so
  // native.css keys off classes we set here instead. bb-native gates the
  // native-only cosmetic rules; bb-safe-status-bar gates the safe-area frame.
  document.documentElement.classList.add("bb-native");

  var shell = window.__BB_NATIVE_SHELL__ || {};
  var safeAreaMode = shell.safeAreaMode === "bleed" || shell.safeAreaMode === "none"
    ? shell.safeAreaMode
    : "band";
  var safeAreaEnabled = safeAreaMode !== "none";
  if (safeAreaEnabled) {
    document.documentElement.classList.add("bb-safe-status-bar");
    document.documentElement.classList.add(
      safeAreaMode === "bleed" ? "bb-safe-bleed" : "bb-safe-band",
    );
    if (shell.safeAreaColor) {
      document.documentElement.style.setProperty("--bb-safe-fill", shell.safeAreaColor);
    }
  }

  // The shipped viewport allows zoom for accessibility on the web; in the app a
  // pinch-zoomable game reads as a webview. Tighten it here only.
  var vp = document.querySelector('meta[name="viewport"]');
  if (vp) {
    vp.setAttribute(
      "content",
      "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
    );
  }

  // Capacitor 8 SystemBars handles edge-to-edge on Android 15+ and injects
  // --safe-area-inset-* CSS vars (incl. display cutout / punch-hole). iOS uses
  // env(safe-area-inset-*) via viewport-fit=cover. native.css pads UI chrome when
  // platforms.<platform>.safeAreaMode is "band" or "bleed" (i.e. not "none").
  var SystemBars = P.SystemBars;
  if (SystemBars && SystemBars.setStyle) {
    SystemBars.setStyle({ style: "DARK" }).catch(function () {});
  } else if (P.StatusBar && P.StatusBar.setStyle) {
    P.StatusBar.setStyle({ style: "DARK" }).catch(function () {});
  }
  // Capacitor's iOS implementation also resizes WKWebView here. Bleed/none must
  // overlay so the game's own background reaches the physical top edge; band
  // deliberately keeps the webview below the status bar. Android 15+ may ignore
  // this because edge-to-edge is enforced, which is fine.
  if (
    P.StatusBar &&
    P.StatusBar.setOverlaysWebView
  ) {
    P.StatusBar.setOverlaysWebView({ overlay: safeAreaMode !== "band" }).catch(function () {});
  }

  var ANDROID_SAFE_TOP_MIN = 28;

  function readSafeTopPx() {
    var value = getComputedStyle(document.documentElement)
      .getPropertyValue("--safe-area-inset-top")
      .trim();
    return value ? parseFloat(value) : 0;
  }

  function applyAndroidSafeTopFallback() {
    if (!safeAreaEnabled) return;
    if (Cap.getPlatform && Cap.getPlatform() !== "android") return;

    var root = document.documentElement;
    function setFallback(px) {
      if (px > 0) {
        root.style.setProperty("--bb-safe-area-top-fallback", Math.round(px) + "px");
      }
    }

    function fromViewport() {
      var vv = window.visualViewport;
      if (!vv) return 0;
      return Math.max(0, vv.offsetTop);
    }

    function syncInsets() {
      var top = Math.max(readSafeTopPx(), fromViewport());
      if (top <= 0) top = ANDROID_SAFE_TOP_MIN;
      setFallback(top);
    }

    syncInsets();
    // SystemBars may inject --safe-area-inset-* after the first layout pass.
    window.setTimeout(syncInsets, 50);
    window.setTimeout(syncInsets, 250);
    window.setTimeout(syncInsets, 1000);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncInsets);
    }
  }

  applyAndroidSafeTopFallback();
  document.addEventListener("DOMContentLoaded", applyAndroidSafeTopFallback, { once: true });

  // Capacitor keeps LaunchScreen.storyboard visible (launchAutoHide: false) until
  // we call SplashScreen.hide() after the first React paint into #root.
  var splashDone = false;
  function hideSplash() {
    if (splashDone) return;
    splashDone = true;
    if (SplashScreen && SplashScreen.hide) {
      SplashScreen.hide({ fadeOutDuration: 200 }).catch(function () {});
    }
  }

  function finishSplash() {
    // One rAF so the first frame is actually on screen before we uncover it.
    requestAnimationFrame(function () {
      requestAnimationFrame(hideSplash);
    });
  }

  function watchForFirstPaint() {
    var root = document.getElementById("root");
    if (root && root.childElementCount > 0) {
      finishSplash();
      return;
    }
    if (!root) {
      document.addEventListener("DOMContentLoaded", watchForFirstPaint, { once: true });
      return;
    }
    var obs = new MutationObserver(function () {
      if (root.childElementCount > 0) {
        obs.disconnect();
        finishSplash();
      }
    });
    obs.observe(root, { childList: true });
  }
  watchForFirstPaint();
  setTimeout(finishSplash, 4000);

  // Light, intentional feedback that makes choices feel like physical buttons.
  // Choice buttons get a Medium tap; other controls (mute, menu) a Light one.
  // Scoped by class so it does not fire on incidental taps.
  var CHOICE_SELECTOR =
    ".bb-default-choice, .choice-list-stack button, [data-choice], button[data-choice-id]";

  if (Haptics && Haptics.impact) {
    document.addEventListener(
      "pointerdown",
      function (e) {
        var t = e.target;
        if (!t || typeof t.closest !== "function") return;
        if (t.closest(CHOICE_SELECTOR)) {
          Haptics.impact({ style: "MEDIUM" }).catch(function () {});
        } else if (t.closest("button, [role='button']")) {
          Haptics.impact({ style: "LIGHT" }).catch(function () {});
        }
      },
      { capture: true, passive: true },
    );
  }

  // WKWebView does not reliably fire visibilitychange on background. The player's
  // audio engine self-suspends on visibility/pagehide; bridge the native pause/
  // resume to those so music stops cleanly when the app is backgrounded.
  if (App && App.addListener) {
    App.addListener("appStateChange", function (state) {
      if (!state || state.isActive) {
        document.dispatchEvent(new Event("bb:native-resume"));
      } else {
        // Mirror the web hide path the audio engine already listens for.
        document.dispatchEvent(new Event("bb:native-pause"));
        window.dispatchEvent(new Event("pagehide"));
      }
    });
  }
})();
