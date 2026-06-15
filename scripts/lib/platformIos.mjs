/** iOS platform metadata helpers (orientations, App Store category). */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const IOS_ORIENTATIONS = {
  portrait: "UIInterfaceOrientationPortrait",
  portraitUpsideDown: "UIInterfaceOrientationPortraitUpsideDown",
  landscapeLeft: "UIInterfaceOrientationLandscapeLeft",
  landscapeRight: "UIInterfaceOrientationLandscapeRight",
};

export const IOS_CATEGORIES = {
  games: "public.app-category.games",
  entertainment: "public.app-category.entertainment",
  books: "public.app-category.books",
  education: "public.app-category.education",
  utilities: "public.app-category.utilities",
};

const ORIENTATION_ALIASES = {
  landscape: ["landscapeLeft", "landscapeRight"],
};

export function normalizeOrientationList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const alias = ORIENTATION_ALIASES[item];
    if (alias) {
      out.push(...alias);
      continue;
    }
    if (IOS_ORIENTATIONS[item]) {
      out.push(item);
      continue;
    }
    if (item.startsWith("UIInterfaceOrientation")) {
      out.push(item);
    }
  }
  return [...new Set(out.map((key) => IOS_ORIENTATIONS[key] ?? key))];
}

/** Resolve platforms.ios.orientations from scenario.json. */
export function resolveIosOrientations(raw) {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    const orientations = normalizeOrientationList(raw);
    return orientations.length ? { iphone: orientations, ipad: orientations } : null;
  }

  if (typeof raw === "object") {
    const iphone = raw.iphone ? normalizeOrientationList(raw.iphone) : null;
    const ipad = raw.ipad ? normalizeOrientationList(raw.ipad) : null;
    if (!iphone?.length && !ipad?.length) return null;
    return {
      iphone: iphone?.length ? iphone : null,
      ipad: ipad?.length ? ipad : null,
    };
  }

  return null;
}

/** Resolve platforms.ios.category ("games" or full LSApplicationCategoryType). */
export function resolveIosCategory(raw) {
  if (!raw || typeof raw !== "string") return null;
  if (raw.startsWith("public.app-category.")) return raw;
  return IOS_CATEGORIES[raw.toLowerCase()] ?? null;
}

export function quotePbxValue(value) {
  const text = String(value);
  if (/^[A-Za-z0-9._-]+$/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function setPlistString(plist, key, value) {
  const escaped = escapeXml(value);
  if (plist.includes(`<key>${key}</key>`)) {
    return plist.replace(
      new RegExp(`(<key>${key}<\\/key>\\s*<string>)[^<]*(<\\/string>)`),
      `$1${escaped}$2`,
    );
  }
  return plist.replace(
    /<\/dict>\s*<\/plist>/,
    `\t<key>${key}</key>\n\t<string>${escaped}</string>\n</dict>\n</plist>`,
  );
}

export function setPlistStringArray(plist, key, values) {
  const items = values.map((value) => `\t\t<string>${escapeXml(value)}</string>`).join("\n");
  const block = `\t<key>${key}</key>\n\t<array>\n${items}\n\t</array>`;
  const pattern = new RegExp(`\\t<key>${key}<\\/key>\\s*<array>[\\s\\S]*?<\\/array>`);
  if (pattern.test(plist)) {
    return plist.replace(pattern, block);
  }
  return plist.replace(/<\/dict>\s*<\/plist>/, `${block}\n</dict>\n</plist>`);
}

/** Upsert INFOPLIST_KEY_* build settings on the App target configurations. */
export function upsertIosTargetBuildSettings(pbxproj, settings) {
  return pbxproj.replace(
    /(buildSettings = \{[\s\S]*?INFOPLIST_FILE = App\/Info\.plist;)([\s\S]*?)(\n\t\t\t\};)/g,
    (match, head, middle, tail) => {
      let updatedMiddle = middle;
      for (const [key, value] of Object.entries(settings)) {
        const line = `\n\t\t\t\t${key} = ${quotePbxValue(value)};`;
        const keyPattern = new RegExp(`\\n\\t\\t\\t\\t${key} = [^;]+;`, "g");
        updatedMiddle = updatedMiddle.includes(`\t\t\t\t${key} = `)
          ? updatedMiddle.replace(keyPattern, line)
          : `${updatedMiddle}${line}`;
      }
      return `${head}${updatedMiddle}${tail}`;
    },
  );
}

/** INFOPLIST_KEY_* values derived from resolved platforms.ios config (pbxproj source of truth). */
export function buildIosInfoPlistKeys(config) {
  const keys = {
    INFOPLIST_KEY_CFBundleDisplayName: config.displayName,
    // Xcode sometimes writes "LaunchScreen.storyboard" — black gap on iOS 14+ without this.
    INFOPLIST_KEY_UILaunchStoryboardName: "LaunchScreen",
  };
  if (config.category) {
    keys.INFOPLIST_KEY_LSApplicationCategoryType = config.category;
  }
  if (config.orientations?.iphone?.length) {
    keys.INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone =
      config.orientations.iphone.join(" ");
  }
  if (config.orientations?.ipad?.length) {
    keys.INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad = config.orientations.ipad.join(" ");
  }
  return keys;
}

function syncIosSchemeNaming({ iosAppDir, schemeName, pbxproj }) {
  const targetId = extractIosTargetId(pbxproj);
  if (targetId) {
    writeIosXcodeScheme({
      xcodeprojDir: path.join(iosAppDir, "App.xcodeproj"),
      schemeName,
      targetId,
    });
  }

  const podfile = path.join(iosAppDir, "Podfile");
  if (existsSync(podfile)) {
    let pod = readFileSync(podfile, "utf8");
    const podAfter = pod.replace(/target 'App' do/, `target '${schemeName}' do`);
    if (podAfter !== pod) writeFileSync(podfile, podAfter);
  }
}

/** Apply platforms.ios metadata via pbxproj build settings (single source of truth). */
export function applyIosPlatformSettings({ iosAppDir, config, log = () => {} }) {
  const schemeName = iosXcodeSchemeName(config.displayName);
  const pbxprojPath = path.join(iosAppDir, "App.xcodeproj", "project.pbxproj");
  if (!existsSync(pbxprojPath)) return false;

  const before = readFileSync(pbxprojPath, "utf8");
  let after = renameIosXcodeTarget(before, schemeName);
  after = after
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${config.version};`)
    .replace(
      /CURRENT_PROJECT_VERSION = [^;]+;/g,
      `CURRENT_PROJECT_VERSION = ${config.buildNumber};`,
    )
    .replace(
      /PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,
      `PRODUCT_BUNDLE_IDENTIFIER = ${config.bundleId};`,
    );
  after = upsertIosTargetBuildSettings(after, buildIosInfoPlistKeys(config));

  const changed = after !== before;
  if (changed) {
    writeFileSync(pbxprojPath, after);
  }

  syncIosSchemeNaming({ iosAppDir, schemeName, pbxproj: after });

  if (changed || schemeName !== "App") {
    const extras = [
      config.category ? `category=${config.category}` : null,
      config.orientations?.iphone?.length ? "orientations" : null,
    ]
      .filter(Boolean)
      .join(", ");
    log(
      `applied iOS platform settings: display="${config.displayName}" scheme=${schemeName} version=${config.version} build=${config.buildNumber} bundleId=${config.bundleId}` +
        (extras ? ` (${extras})` : ""),
    );
  }

  return changed || schemeName !== "App";
}

/** Xcode scheme / target name derived from the game's display name. */
export function iosXcodeSchemeName(displayName) {
  const cleaned = String(displayName ?? "App")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "");
  if (!cleaned) return "App";
  if (/^\d/.test(cleaned)) return `Game${cleaned}`;
  return cleaned;
}

/** Rename the Capacitor iOS target from the default "App" to a game-specific scheme name. */
export function renameIosXcodeTarget(pbxproj, schemeName) {
  if (schemeName === "App") return pbxproj;

  let out = pbxproj;
  out = out.replace(
    /explicitFileType = wrapper\.application; includeInIndex = 0; path = App\.app;/,
    `explicitFileType = wrapper.application; includeInIndex = 0; path = ${schemeName}.app;`,
  );
  out = out.replace(/\/\* App\.app \*\//g, `/* ${schemeName}.app */`);
  out = out.replace(/PBXNativeTarget "App"/g, `PBXNativeTarget "${schemeName}"`);
  out = out.replace(/PBXProject "App"/g, `PBXProject "${schemeName}"`);
  out = out.replace(
    /(isa = PBXNativeTarget;[\s\S]*?dependencies = \(\s*\);\s*name = )App(;\s*packageProductDependencies)/,
    `$1${schemeName}$2`,
  );
  out = out.replace(
    /(packageProductDependencies[\s\S]*?productName = )App(;\s*productReference)/,
    `$1${schemeName}$2`,
  );
  out = out.replace(
    /([A-F0-9]+) \/\* App \*\/ = \{\n\t\t\tisa = PBXNativeTarget;/g,
    `$1 /* ${schemeName} */ = {\n\t\t\tisa = PBXNativeTarget;`,
  );
  out = out.replace(
    /targets = \(\s*\n\t\t\t\t([A-F0-9]+) \/\* App \*\/,/,
    `targets = (\n\t\t\t\t$1 /* ${schemeName} */,`,
  );
  return out;
}

function extractIosTargetId(pbxproj) {
  const match = pbxproj.match(/([A-F0-9]+) \/\* [^*]+ \*\/ = \{\s*isa = PBXNativeTarget;/);
  return match?.[1] ?? null;
}

function buildableReference(targetId, schemeName) {
  return `            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${targetId}"
               BuildableName = "${schemeName}.app"
               BlueprintName = "${schemeName}"
               ReferencedContainer = "container:App.xcodeproj">
            </BuildableReference>`;
}

/** Write a shared Xcode scheme for cap/xcodebuild (container stays App.xcodeproj per Capacitor). */
export function writeIosXcodeScheme({ xcodeprojDir, schemeName, targetId }) {
  const schemesDir = path.join(xcodeprojDir, "xcshareddata", "xcschemes");
  mkdirSync(schemesDir, { recursive: true });
  const buildableRef = buildableReference(targetId, schemeName);

  const scheme = `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "0920"
   version = "1.3">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
${buildableRef}
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
      </Testables>
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
${buildableRef}
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
${buildableRef}
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`;
  writeFileSync(path.join(schemesDir, `${schemeName}.xcscheme`), scheme);

  const legacyScheme = path.join(schemesDir, "App.xcscheme");
  if (schemeName !== "App" && existsSync(legacyScheme)) {
    rmSync(legacyScheme);
  }
}

/** Apply game-specific target + scheme naming (Capacitor keeps App.xcodeproj / ios/App paths). */
export function applyIosXcodeScheme({ iosAppDir, schemeName }) {
  const pbxprojPath = path.join(iosAppDir, "App.xcodeproj", "project.pbxproj");
  if (!existsSync(pbxprojPath)) return false;

  const before = readFileSync(pbxprojPath, "utf8");
  const after = renameIosXcodeTarget(before, schemeName);
  if (after !== before) {
    writeFileSync(pbxprojPath, after);
  }

  syncIosSchemeNaming({ iosAppDir, schemeName, pbxproj: after });
  return schemeName !== "App" || after !== before;
}
