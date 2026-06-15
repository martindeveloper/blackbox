export type { BlackboxConfiguration, BlackboxPlatform } from "./platformTypes.js";

export const BLACKBOX_PLATFORM = "ios" as const;
export const BLACKBOX_CONFIGURATION = "release" as const;
export const IS_WEB_PLATFORM = false as const;
export const IS_DEBUG_CONFIGURATION = false as const;
export const IS_RELEASE_CONFIGURATION = true as const;
export const SUPPORT_BUNDLE_ENABLED = false as const;
