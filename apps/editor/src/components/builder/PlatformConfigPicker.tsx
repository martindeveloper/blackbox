import { useTranslation } from "react-i18next";
import type {
  BuildCapabilities,
  BuildConfiguration,
  BuildPlatform,
  PlatformCapability,
} from "../../lib/buildApi.js";
import { BUILD_CONFIGURATIONS, BUILD_PLATFORMS } from "../../lib/buildApi.js";

interface Props {
  platform: BuildPlatform;
  configuration: BuildConfiguration;
  capabilities: BuildCapabilities | null;
  disabled: boolean;
  onPlatform: (platform: BuildPlatform) => void;
  onConfiguration: (configuration: BuildConfiguration) => void;
}

function platformCapability(
  capabilities: BuildCapabilities | null,
  platform: BuildPlatform,
): PlatformCapability {
  if (!capabilities)
    return { available: true, reasons: [], package: { available: true, reasons: [] } };
  return capabilities[platform];
}

const PLATFORM_LABEL: Record<BuildPlatform, string> = {
  web: "build.platformWeb",
  ios: "build.platformIos",
  android: "build.platformAndroid",
};

export function PlatformConfigPicker({
  platform,
  configuration,
  capabilities,
  disabled,
  onPlatform,
  onConfiguration,
}: Props) {
  const { t } = useTranslation();
  const selectedCap = platformCapability(capabilities, platform);

  return (
    <div className="build-config-grid">
      <section className="build-section build-config-section">
        <span className="build-section-label">{t("build.platform")}</span>
        <div className="build-segment" role="group" aria-label={t("build.platform")}>
          {BUILD_PLATFORMS.map((value) => {
            const cap = platformCapability(capabilities, value);
            const blocked = !cap.available;
            return (
              <button
                key={value}
                type="button"
                disabled={disabled || blocked}
                aria-pressed={value === platform}
                title={blocked ? cap.reasons.join(" · ") : undefined}
                onClick={() => onPlatform(value)}
                className={`build-segment-option${
                  value === platform ? " build-segment-option--active" : ""
                }`}
              >
                {t(PLATFORM_LABEL[value])}
              </button>
            );
          })}
        </div>
        {!selectedCap.available && selectedCap.reasons.length > 0 ? (
          <p className="build-hint build-hint--warn">{selectedCap.reasons.join(" · ")}</p>
        ) : null}
      </section>

      <section className="build-section build-config-section">
        <span className="build-section-label">{t("build.configuration")}</span>
        <div className="build-segment" role="group" aria-label={t("build.configuration")}>
          {BUILD_CONFIGURATIONS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-pressed={value === configuration}
              onClick={() => onConfiguration(value)}
              className={`build-segment-option${
                value === configuration ? " build-segment-option--active" : ""
              }`}
            >
              {t(value === "debug" ? "build.configDebug" : "build.configRelease")}
            </button>
          ))}
        </div>
        <p className="build-hint">
          {t(configuration === "debug" ? "build.debugHint" : "build.releaseHint")}
        </p>
      </section>
    </div>
  );
}
