export type BuildPlatform = "web" | "ios" | "android";
export type BuildConfiguration = "debug" | "release";
export type BuildStage = "bundle" | "build" | "package";

export const BUILD_PLATFORMS: BuildPlatform[];
export const BUILD_CONFIGURATIONS: BuildConfiguration[];
export const BUILD_STAGES: BuildStage[];

export function stagesForPlatform(platform: BuildPlatform): BuildStage[];
