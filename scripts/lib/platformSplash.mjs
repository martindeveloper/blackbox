import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_BG } from "./adventure.mjs";
import { loadSharp } from "./platformSharp.mjs";

// iOS 14+ rejects launch-screen bitmaps whose longest edge exceeds ~2499px (black screen).
// Capacitor keeps the default Splash.imageset filenames; we only change the generated pixels.
const IOS_SPLASH_SIZES = [
  { file: "splash-2732x2732-2.png", width: 828, height: 1792 },
  { file: "splash-2732x2732-1.png", width: 1242, height: 2208 },
  { file: "splash-2732x2732.png", width: 1170, height: 2400 },
];

const ANDROID_PORT_SPLASH_SIZES = [
  { folder: "drawable-port-mdpi", width: 320, height: 568 },
  { folder: "drawable-port-hdpi", width: 480, height: 854 },
  { folder: "drawable-port-xhdpi", width: 720, height: 1280 },
  { folder: "drawable-port-xxhdpi", width: 1080, height: 1920 },
  { folder: "drawable-port-xxxhdpi", width: 1440, height: 2560 },
];

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized.padStart(6, "0").slice(0, 6);
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

async function writeCoverPng(imagePath, outPath, width, height = width) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  await loadSharp()(imagePath)
    .resize(width, height, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(outPath);
}

/** Launch screen with a constrained image view — more reliable than imageView-as-root. */
function writeLaunchScreenStoryboard(launchStoryboardPath, backgroundColor) {
  const { r, g, b } = hexToRgb(backgroundColor);
  const { width: imgW, height: imgH } = IOS_SPLASH_SIZES[IOS_SPLASH_SIZES.length - 1];
  const storyboard = `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="17132" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
    <device id="retina6_12" orientation="portrait" appearance="light"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="17105"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="EHf-IW-A2E">
            <objects>
                <viewController id="01J-lp-oVM" sceneMemberID="viewController">
                    <view key="view" contentMode="scaleToFill" id="EXPO-VIEW">
                        <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <subviews>
                            <imageView clipsSubviews="YES" userInteractionEnabled="NO" contentMode="scaleAspectFill" horizontalHuggingPriority="251" verticalHuggingPriority="251" image="Splash" translatesAutoresizingMaskIntoConstraints="NO" id="snD-IY-ifK">
                                <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                            </imageView>
                        </subviews>
                        <color key="backgroundColor" red="${r}" green="${g}" blue="${b}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                        <constraints>
                            <constraint firstItem="snD-IY-ifK" firstAttribute="top" secondItem="EXPO-VIEW" secondAttribute="top" id="c-top"/>
                            <constraint firstItem="snD-IY-ifK" firstAttribute="bottom" secondItem="EXPO-VIEW" secondAttribute="bottom" id="c-bottom"/>
                            <constraint firstItem="snD-IY-ifK" firstAttribute="leading" secondItem="EXPO-VIEW" secondAttribute="leading" id="c-leading"/>
                            <constraint firstItem="snD-IY-ifK" firstAttribute="trailing" secondItem="EXPO-VIEW" secondAttribute="trailing" id="c-trailing"/>
                        </constraints>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="53" y="375"/>
        </scene>
    </scenes>
    <resources>
        <image name="Splash" width="${imgW}" height="${imgH}"/>
    </resources>
</document>
`;
  writeFileSync(launchStoryboardPath, storyboard);
}

/** Install splash images into the iOS Splash asset catalog and rewrite LaunchScreen. */
export async function installIosSplash({
  imagePath,
  backgroundColor = DEFAULT_BG,
  assetCatalogDir,
  launchStoryboardPath,
}) {
  const splashSet = path.join(assetCatalogDir, "Splash.imageset");
  if (!existsSync(splashSet)) return null;

  await Promise.all(
    IOS_SPLASH_SIZES.map(({ file, width, height }) =>
      writeCoverPng(imagePath, path.join(splashSet, file), width, height),
    ),
  );

  if (launchStoryboardPath) {
    writeLaunchScreenStoryboard(launchStoryboardPath, backgroundColor);
  }

  return splashSet;
}

/**
 * Wire the launch theme to the Android 12+ SplashScreen API.
 *
 * On Android 12+ the launch splash is the *system* splash drawn by
 * `installSplashScreen()` (see @capacitor/splash-screen); it honours ONLY
 * `windowSplashScreenBackground` (a solid color) + `windowSplashScreenAnimatedIcon`
 * (a centered, circle-masked icon) and IGNORES `android:background`. Capacitor's
 * default `AppTheme.NoActionBarLaunch` sets `android:background=@drawable/splash`,
 * so the system falls back to a white window + the masked launcher icon and the
 * full-bleed `splash.png` is never shown. A full-bleed photo splash is not
 * possible on 12+ by design, so we brand the system splash instead: paint it the
 * splash background color and center the launcher icon on it.
 */
function installAndroidSplashTheme(resDir, backgroundColor) {
  const valuesDir = path.join(resDir, "values");
  const stylesPath = path.join(valuesDir, "styles.xml");
  if (!existsSync(stylesPath)) return;

  // Upsert the splash background color (keeps any existing colors.xml entries).
  const colorsPath = path.join(valuesDir, "colors.xml");
  const colorEntry = `    <color name="splash_background">${backgroundColor}</color>`;
  if (existsSync(colorsPath)) {
    const colors = readFileSync(colorsPath, "utf8");
    if (/name="splash_background"/.test(colors)) {
      writeFileSync(
        colorsPath,
        colors.replace(
          /<color name="splash_background">[^<]*<\/color>/,
          `<color name="splash_background">${backgroundColor}</color>`,
        ),
      );
    } else {
      writeFileSync(colorsPath, colors.replace(/<\/resources>/, `${colorEntry}\n</resources>`));
    }
  } else {
    writeFileSync(
      colorsPath,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${colorEntry}\n</resources>\n`,
    );
  }

  // Rewrite the launch theme to drive the Android 12 splash API.
  const launchStyle = `<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/splash_background</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>`;
  const styles = readFileSync(stylesPath, "utf8");
  const next = styles.replace(
    /<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/,
    launchStyle,
  );
  if (next !== styles) {
    writeFileSync(stylesPath, next);
  }
}

/** Install portrait splash drawables for Android and wire the launch theme. */
export async function installAndroidSplash({ imagePath, resDir, backgroundColor = DEFAULT_BG }) {
  if (!existsSync(resDir)) return null;

  const tasks = ANDROID_PORT_SPLASH_SIZES.map(({ folder, width, height }) =>
    writeCoverPng(imagePath, path.join(resDir, folder, "splash.png"), width, height),
  );
  tasks.push(writeCoverPng(imagePath, path.join(resDir, "drawable", "splash.png"), 1080, 1920));
  await Promise.all(tasks);

  // The drawables above only serve pre-12 devices / explicit SplashScreen.show()
  // calls; Android 12+ needs the theme wired to the system splash API.
  installAndroidSplashTheme(resDir, backgroundColor);
  return resDir;
}
