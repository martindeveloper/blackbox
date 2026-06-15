export const BUILD_PLATFORMS = ["web", "ios", "android"];
export const BUILD_CONFIGURATIONS = ["debug", "release"];
export const BUILD_STAGES = ["bundle", "build", "package"];

export function stagesForPlatform(_platform) {
  return [...BUILD_STAGES];
}
