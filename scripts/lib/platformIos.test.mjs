import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyIosDeploymentTarget,
  buildIosInfoPlistKeys,
  renameIosXcodeTarget,
  resolveIosDeploymentTarget,
  upsertIosTargetBuildSettings,
  validateIosSdkConfig,
} from "./platformIos.mjs";

const SAMPLE_CONFIG = {
  displayName: "Example Game",
  version: "2.4",
  buildNumber: "42",
  bundleId: "com.example.mygame",
  category: "public.app-category.games",
  orientations: {
    iphone: ["UIInterfaceOrientationPortrait"],
    ipad: ["UIInterfaceOrientationPortrait", "UIInterfaceOrientationLandscapeLeft"],
  },
};

const SAMPLE_PBXPROJ = `// !$*UTF8*$!
{
	objects = {
		A1000001 /* App */ = {
			isa = PBXNativeTarget;
		};
		C1000001 /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				INFOPLIST_FILE = App/Info.plist;
				MARKETING_VERSION = 0.1;
				CURRENT_PROJECT_VERSION = 1;
				PRODUCT_BUNDLE_IDENTIFIER = com.example.old;
			};
		};
		C1000002 /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				INFOPLIST_FILE = App/Info.plist;
				MARKETING_VERSION = 0.1;
				CURRENT_PROJECT_VERSION = 1;
				PRODUCT_BUNDLE_IDENTIFIER = com.example.old;
			};
		};
	};
}
`;

test("buildIosInfoPlistKeys maps scenario config to INFOPLIST_KEY_* settings", () => {
  const keys = buildIosInfoPlistKeys(SAMPLE_CONFIG);
  assert.equal(keys.INFOPLIST_KEY_CFBundleDisplayName, "Example Game");
  assert.equal(keys.INFOPLIST_KEY_UILaunchStoryboardName, "LaunchScreen");
  assert.equal(keys.INFOPLIST_KEY_LSApplicationCategoryType, "public.app-category.games");
  assert.equal(
    keys.INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone,
    "UIInterfaceOrientationPortrait",
  );
  assert.equal(
    keys.INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad,
    "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft",
  );
});

test("upsertIosTargetBuildSettings writes INFOPLIST_KEY_* into every App target configuration", () => {
  const keys = buildIosInfoPlistKeys(SAMPLE_CONFIG);
  const updated = upsertIosTargetBuildSettings(SAMPLE_PBXPROJ, keys);

  assert.match(updated, /INFOPLIST_KEY_CFBundleDisplayName = "Example Game";/);
  assert.match(updated, /INFOPLIST_KEY_UILaunchStoryboardName = LaunchScreen;/);
  assert.match(updated, /INFOPLIST_KEY_LSApplicationCategoryType = public\.app-category\.games;/);
  assert.equal(
    (updated.match(/INFOPLIST_KEY_CFBundleDisplayName = "Example Game";/g) ?? []).length,
    2,
  );
});

test("renameIosXcodeTarget and upsert compose without duplicating plist metadata paths", () => {
  let pbxproj = renameIosXcodeTarget(SAMPLE_PBXPROJ, "ExampleGame");
  pbxproj = pbxproj
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${SAMPLE_CONFIG.version};`)
    .replace(
      /CURRENT_PROJECT_VERSION = [^;]+;/g,
      `CURRENT_PROJECT_VERSION = ${SAMPLE_CONFIG.buildNumber};`,
    )
    .replace(
      /PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,
      `PRODUCT_BUNDLE_IDENTIFIER = ${SAMPLE_CONFIG.bundleId};`,
    );
  pbxproj = upsertIosTargetBuildSettings(pbxproj, buildIosInfoPlistKeys(SAMPLE_CONFIG));

  assert.match(pbxproj, /MARKETING_VERSION = 2\.4;/);
  assert.match(pbxproj, /CURRENT_PROJECT_VERSION = 42;/);
  assert.match(pbxproj, /PRODUCT_BUNDLE_IDENTIFIER = com\.example\.mygame;/);
  assert.match(pbxproj, /INFOPLIST_KEY_CFBundleDisplayName = "Example Game";/);
  assert.doesNotMatch(pbxproj, /<key>CFBundleDisplayName<\/key>/);
});

test("resolveIosDeploymentTarget applies defaults only when unset", () => {
  assert.equal(resolveIosDeploymentTarget({}), "15.0");
  assert.equal(resolveIosDeploymentTarget({ deploymentTarget: "16.0" }), "16.0");
  assert.equal(resolveIosDeploymentTarget({ deploymentTarget: "14.0" }), "14.0");
});

test("validateIosSdkConfig rejects deployment targets below the engine floor", () => {
  const checks = validateIosSdkConfig({ deploymentTarget: "14.0" });
  assert.equal(checks.length, 1);
  assert.match(checks[0].message, /at least 15\.0/);
});

test("applyIosDeploymentTarget patches Podfile and pbxproj", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bb-ios-apply-"));
  const iosAppDir = path.join(root, "App");
  await mkdir(path.join(iosAppDir, "App.xcodeproj"), { recursive: true });
  await writeFile(path.join(iosAppDir, "Podfile"), "platform :ios, '13.0'\n");
  await writeFile(
    path.join(iosAppDir, "App.xcodeproj", "project.pbxproj"),
    "IPHONEOS_DEPLOYMENT_TARGET = 13.0;\nIPHONEOS_DEPLOYMENT_TARGET = 13.0;\n",
  );

  applyIosDeploymentTarget({ iosAppDir, deploymentTarget: "16.0" });

  assert.match(readFileSync(path.join(iosAppDir, "Podfile"), "utf8"), /platform :ios, '16\.0'/);
  assert.doesNotMatch(
    readFileSync(path.join(iosAppDir, "App.xcodeproj", "project.pbxproj"), "utf8"),
    /13\.0/,
  );
});
