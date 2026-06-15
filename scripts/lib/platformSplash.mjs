import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

/** Install portrait splash drawables for Android. */
export async function installAndroidSplash({ imagePath, resDir }) {
  if (!existsSync(resDir)) return null;

  const tasks = ANDROID_PORT_SPLASH_SIZES.map(({ folder, width, height }) =>
    writeCoverPng(imagePath, path.join(resDir, folder, "splash.png"), width, height),
  );
  tasks.push(writeCoverPng(imagePath, path.join(resDir, "drawable", "splash.png"), 1080, 1920));
  await Promise.all(tasks);
  return resDir;
}
