export type { BlackboxConfiguration, BlackboxPlatform } from "./platformTypes.js";

export const BLACKBOX_PLATFORM = "web" as const;
export const BLACKBOX_CONFIGURATION = "release" as const;
export const IS_WEB_PLATFORM = true as const;
export const IS_DEBUG_CONFIGURATION = false as const;
export const IS_RELEASE_CONFIGURATION = true as const;
export const SUPPORT_BUNDLE_ENABLED = true as const;
