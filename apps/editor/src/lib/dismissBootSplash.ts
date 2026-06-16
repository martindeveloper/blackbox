const BOOT_SPLASH_ID = "boot-splash";
const FADE_MS = 320;

export function dismissBootSplash(): void {
  const splash = document.getElementById(BOOT_SPLASH_ID);
  if (!splash || splash.classList.contains("boot-splash--out")) return;

  splash.classList.add("boot-splash--out");

  const remove = () => splash.remove();
  splash.addEventListener("transitionend", remove, { once: true });
  window.setTimeout(remove, FADE_MS + 40);
}
