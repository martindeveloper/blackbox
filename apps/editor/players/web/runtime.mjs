import path from "node:path";
import { PACKAGED_WORKSPACE_REL } from "./manifest.mjs";

export function configureWebRuntime({ usePackagedResources, clientRoot, resourcesPath, env }) {
  env.BLACKBOX_PLAYER_WEB_WORKSPACE = usePackagedResources
    ? path.join(resourcesPath, PACKAGED_WORKSPACE_REL)
    : path.join(clientRoot, "..", "web");
}
