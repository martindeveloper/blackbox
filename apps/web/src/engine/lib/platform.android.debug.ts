export type { BlackboxConfiguration, BlackboxPlatform } from "./platformTypes.js";

export const BLACKBOX_PLATFORM = "android" as const;
export const BLACKBOX_CONFIGURATION = "debug" as const;
export const IS_WEB_PLATFORM = false as const;
export const IS_DEBUG_CONFIGURATION = true as const;
export const IS_RELEASE_CONFIGURATION = false as const;
export const SUPPORT_BUNDLE_ENABLED = false as const;
