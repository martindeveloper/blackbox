import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BuildPlatform } from "../../lib/buildApi.js";
import { BUILD_PLATFORMS, PLATFORM_LABEL_KEYS } from "../../lib/buildApi.js";
import type {
  AndroidPlatformConfig,
  GameContent,
  IosPlatformConfig,
  PlatformOrientations,
  ScenarioPlatforms,
  WebPlatformConfig,
} from "../../types/wire.js";
import { Icon } from "../icons/Icon.js";
import { PLATFORM_ICONS } from "../icons/PlatformIcons.js";
import { FormField } from "../ui/FormField.js";
import { Input } from "../ui/Input.js";
import { Select } from "../ui/Select.js";

type OrientationPreset = "default" | "portrait" | "landscape" | "all";

interface Props {
  scenario: GameContent;
  onChange: (platforms: ScenarioPlatforms) => void;
}

function optionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function platformConfig<P extends keyof ScenarioPlatforms>(
  platforms: ScenarioPlatforms | undefined,
  platform: P,
): NonNullable<ScenarioPlatforms[P]> {
  return { ...platforms?.[platform] } as NonNullable<ScenarioPlatforms[P]>;
}

function detectOrientationPreset(raw: PlatformOrientations | undefined): OrientationPreset {
  if (!raw) return "default";
  const list = raw.iphone ?? raw.phone ?? [];
  if (list.length === 0) return "default";
  const normalized = list.map((item) => item.toLowerCase());
  const hasPortrait = normalized.some((item) => item.includes("portrait"));
  const hasLandscape = normalized.some((item) => item.includes("landscape"));
  if (hasPortrait && hasLandscape) return "all";
  if (hasLandscape) return "landscape";
  if (hasPortrait) return "portrait";
  return "default";
}

function orientationPresetValue(preset: OrientationPreset): PlatformOrientations | undefined {
  if (preset === "default") return undefined;
  if (preset === "portrait") return { iphone: ["portrait"], ipad: ["portrait"] };
  if (preset === "landscape") return { iphone: ["landscape"], ipad: ["landscape"] };
  return {
    iphone: ["portrait", "landscape"],
    ipad: ["portrait", "landscape"],
  };
}

function androidOrientationPresetValue(preset: OrientationPreset): PlatformOrientations | undefined {
  if (preset === "default") return undefined;
  if (preset === "portrait") return { phone: ["portrait"] };
  if (preset === "landscape") return { phone: ["landscape"] };
  return { phone: ["portrait", "landscape"] };
}

export function ScenarioPlatformSettings({ scenario, onChange }: Props) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<BuildPlatform>("web");
  const platforms = scenario.platforms ?? {};

  const patchPlatform = <P extends keyof ScenarioPlatforms>(
    target: P,
    patch: Partial<NonNullable<ScenarioPlatforms[P]>>,
  ) => {
    onChange({
      ...platforms,
      [target]: { ...platformConfig(platforms, target), ...patch },
    });
  };

  const patchSigning = (patch: Partial<NonNullable<IosPlatformConfig["signing"]>>) => {
    const ios = platformConfig(platforms, "ios") as IosPlatformConfig;
    patchPlatform("ios", {
      signing: { ...ios.signing, ...patch },
    });
  };

  const patchKeystore = (patch: Partial<NonNullable<AndroidPlatformConfig["keystore"]>>) => {
    const android = platformConfig(platforms, "android") as AndroidPlatformConfig;
    patchPlatform("android", {
      keystore: { ...android.keystore, ...patch },
    });
  };

  const web = platformConfig(platforms, "web") as WebPlatformConfig;
  const ios = platformConfig(platforms, "ios") as IosPlatformConfig;
  const android = platformConfig(platforms, "android") as AndroidPlatformConfig;

  const categoryOptions = [
    { value: "", label: t("scenario.platformCategoryDefault") },
    { value: "games", label: t("scenario.platformCategoryGames") },
    { value: "entertainment", label: t("scenario.platformCategoryEntertainment") },
    { value: "books", label: t("scenario.platformCategoryBooks") },
    { value: "education", label: t("scenario.platformCategoryEducation") },
    { value: "utilities", label: t("scenario.platformCategoryUtilities") },
  ];

  const orientationOptions = [
    { value: "default", label: t("scenario.platformOrientationDefault") },
    { value: "portrait", label: t("scenario.platformOrientationPortrait") },
    { value: "landscape", label: t("scenario.platformOrientationLandscape") },
    { value: "all", label: t("scenario.platformOrientationAll") },
  ];

  const safeAreaModeOptions = [
    { value: "band", label: t("scenario.platformSafeAreaModeBand") },
    { value: "bleed", label: t("scenario.platformSafeAreaModeBleed") },
    { value: "none", label: t("scenario.platformSafeAreaModeNone") },
  ];

  const signingMethodOptions = [
    { value: "app-store", label: t("scenario.platformSigningAppStore") },
    { value: "ad-hoc", label: t("scenario.platformSigningAdHoc") },
    { value: "development", label: t("scenario.platformSigningDevelopment") },
    { value: "enterprise", label: t("scenario.platformSigningEnterprise") },
  ];

  return (
    <section className="scenario-panel">
      <div className="scenario-panel-header">{t("scenario.platforms")}</div>
      <div className="scenario-panel-body scenario-platform-body">
        <div
          className="build-segment scenario-platform-tabs"
          role="group"
          aria-label={t("scenario.platforms")}
        >
          {BUILD_PLATFORMS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === platform}
              onClick={() => setPlatform(value)}
              className={`build-segment-option${
                value === platform ? " build-segment-option--active" : ""
              }`}
            >
              <span className="build-segment-option-content">
                <Icon icon={PLATFORM_ICONS[value]} size={14} strokeWidth={1.75} />
                {t(PLATFORM_LABEL_KEYS[value])}
              </span>
            </button>
          ))}
        </div>

        {platform === "web" ? (
          <div className="scenario-platform-fields">
            <FormField label={t("scenario.platformAppName")}>
              <Input
                value={web.appName ?? ""}
                placeholder={scenario.title}
                onChange={(e) => patchPlatform("web", { appName: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformOutputName")}>
              <Input
                mono
                value={web.outputName ?? ""}
                placeholder={t("scenario.platformOutputNamePlaceholder")}
                onChange={(e) =>
                  patchPlatform("web", { outputName: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformVersion")}>
              <Input
                mono
                value={web.version ?? ""}
                placeholder={scenario.revision ?? "1.0"}
                onChange={(e) => patchPlatform("web", { version: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformIcon")}>
              <Input
                mono
                value={web.icon ?? ""}
                placeholder="platform/web/favicon.svg"
                onChange={(e) => patchPlatform("web", { icon: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformBackground")}>
              <Input
                mono
                value={web.backgroundColor ?? ""}
                placeholder="#070503"
                onChange={(e) =>
                  patchPlatform("web", { backgroundColor: optionalString(e.target.value) })
                }
              />
            </FormField>
          </div>
        ) : null}

        {platform === "ios" ? (
          <div className="scenario-platform-fields">
            <FormField label={t("scenario.platformBundleId")}>
              <Input
                mono
                value={ios.bundleId ?? ""}
                placeholder="com.example.mygame"
                onChange={(e) => patchPlatform("ios", { bundleId: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformAppName")}>
              <Input
                value={ios.appName ?? ""}
                placeholder={scenario.title}
                onChange={(e) => patchPlatform("ios", { appName: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformDisplayName")}>
              <Input
                value={ios.displayName ?? ""}
                placeholder={ios.appName ?? scenario.title}
                onChange={(e) =>
                  patchPlatform("ios", { displayName: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformVersion")}>
              <Input
                mono
                value={ios.version ?? ""}
                placeholder={scenario.revision ?? "1.0"}
                onChange={(e) => patchPlatform("ios", { version: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformBuildNumber")}>
              <Input
                mono
                value={ios.buildNumber ?? ""}
                placeholder="1"
                onChange={(e) =>
                  patchPlatform("ios", { buildNumber: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformCategory")}>
              <Select
                options={categoryOptions}
                value={ios.category ?? ""}
                onChange={(e) => patchPlatform("ios", { category: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformOrientations")}>
              <Select
                options={orientationOptions}
                value={detectOrientationPreset(ios.orientations)}
                onChange={(e) =>
                  patchPlatform("ios", {
                    orientations: orientationPresetValue(e.target.value as OrientationPreset),
                  })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformIcon")}>
              <Input
                mono
                value={ios.icon ?? ""}
                placeholder="platform/ios/icon.svg"
                onChange={(e) => patchPlatform("ios", { icon: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformBackground")}>
              <Input
                mono
                value={ios.backgroundColor ?? ""}
                placeholder="#070503"
                onChange={(e) =>
                  patchPlatform("ios", { backgroundColor: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformSafeAreaColor")}>
              <Input
                mono
                value={ios.safeAreaColor ?? ""}
                placeholder={ios.backgroundColor ?? "#070503"}
                onChange={(e) =>
                  patchPlatform("ios", { safeAreaColor: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformSafeAreaMode")}>
              <Select
                options={safeAreaModeOptions}
                value={ios.safeAreaMode ?? "band"}
                onChange={(e) =>
                  patchPlatform("ios", {
                    safeAreaMode: e.target.value as "band" | "bleed" | "none",
                  })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformSigningTeamId")}>
              <Input
                mono
                value={ios.signing?.teamId ?? ""}
                placeholder="env:APPLE_TEAM_ID"
                onChange={(e) => patchSigning({ teamId: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformSigningMethod")}>
              <Select
                options={signingMethodOptions}
                value={ios.signing?.method ?? "app-store"}
                onChange={(e) => patchSigning({ method: e.target.value })}
              />
            </FormField>
          </div>
        ) : null}

        {platform === "android" ? (
          <div className="scenario-platform-fields">
            <FormField label={t("scenario.platformApplicationId")}>
              <Input
                mono
                value={android.applicationId ?? android.bundleId ?? ""}
                placeholder="com.example.mygame"
                onChange={(e) =>
                  patchPlatform("android", { applicationId: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformAppName")}>
              <Input
                value={android.appName ?? ""}
                placeholder={scenario.title}
                onChange={(e) =>
                  patchPlatform("android", { appName: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformDisplayName")}>
              <Input
                value={android.displayName ?? ""}
                placeholder={android.appName ?? scenario.title}
                onChange={(e) =>
                  patchPlatform("android", { displayName: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformVersion")}>
              <Input
                mono
                value={android.version ?? ""}
                placeholder={scenario.revision ?? "1.0"}
                onChange={(e) =>
                  patchPlatform("android", { version: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformVersionCode")}>
              <Input
                mono
                type="number"
                value={android.versionCode ?? ""}
                placeholder="1"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  patchPlatform("android", {
                    versionCode: raw === "" ? undefined : Number(raw),
                  });
                }}
              />
            </FormField>
            <FormField label={t("scenario.platformOrientations")}>
              <Select
                options={orientationOptions}
                value={detectOrientationPreset(android.orientations)}
                onChange={(e) =>
                  patchPlatform("android", {
                    orientations: androidOrientationPresetValue(
                      e.target.value as OrientationPreset,
                    ),
                  })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformIcon")}>
              <Input
                mono
                value={android.icon ?? ""}
                placeholder="platform/android/icon.svg"
                onChange={(e) => patchPlatform("android", { icon: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformBackground")}>
              <Input
                mono
                value={android.backgroundColor ?? ""}
                placeholder="#070503"
                onChange={(e) =>
                  patchPlatform("android", { backgroundColor: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformSafeAreaColor")}>
              <Input
                mono
                value={android.safeAreaColor ?? ""}
                placeholder={android.backgroundColor ?? "#070503"}
                onChange={(e) =>
                  patchPlatform("android", { safeAreaColor: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformSafeAreaMode")}>
              <Select
                options={safeAreaModeOptions}
                value={android.safeAreaMode ?? "band"}
                onChange={(e) =>
                  patchPlatform("android", {
                    safeAreaMode: e.target.value as "band" | "bleed" | "none",
                  })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformKeystorePath")}>
              <Input
                mono
                value={android.keystore?.path ?? ""}
                placeholder="release.keystore"
                onChange={(e) => patchKeystore({ path: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformKeystoreAlias")}>
              <Input
                mono
                value={android.keystore?.keyAlias ?? ""}
                placeholder="upload"
                onChange={(e) => patchKeystore({ keyAlias: optionalString(e.target.value) })}
              />
            </FormField>
            <FormField label={t("scenario.platformKeystoreStorePasswordEnv")}>
              <Input
                mono
                value={android.keystore?.storePasswordEnv ?? ""}
                placeholder="ANDROID_KEYSTORE_PASSWORD"
                onChange={(e) =>
                  patchKeystore({ storePasswordEnv: optionalString(e.target.value) })
                }
              />
            </FormField>
            <FormField label={t("scenario.platformKeystoreKeyPasswordEnv")}>
              <Input
                mono
                value={android.keystore?.keyPasswordEnv ?? ""}
                placeholder="ANDROID_KEY_PASSWORD"
                onChange={(e) => patchKeystore({ keyPasswordEnv: optionalString(e.target.value) })}
              />
            </FormField>
          </div>
        ) : null}
      </div>
    </section>
  );
}
