import * as platformAndroid from "./platformAndroid.mjs";
import * as platformIos from "./platformIos.mjs";
import * as platformWeb from "./platformWeb.mjs";

export const PLATFORMS = {
  android: platformAndroid,
  ios: platformIos,
  web: platformWeb,
};

export function getPlatform(name) {
  return PLATFORMS[name] ?? null;
}
