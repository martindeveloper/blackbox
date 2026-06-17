import path from "node:path";
import { PACKAGED_WORKSPACE_REL } from "./manifest.mjs";

export function configureWebRuntime({ usePackagedResources, clientRoot, resourcesPath, env }) {
  env.BLACKBOX_PLAYER_WEB_WORKSPACE = usePackagedResources
    ? path.join(resourcesPath, PACKAGED_WORKSPACE_REL)
    : path.join(clientRoot, "..", "web");

  // The preview's node_modules live in the staged build CLI (resources/cli/apps/web), which is
  // a superset of what the preview needs (rolldown, tailwind, react, …). Resolving from there
  // lets the preview workspace ship without its own duplicate node_modules. Both the CLI and the
  // workspace are always staged together (build-electron.mjs / build-release.mjs). In dev this is
  // left unset, so the preview resolves from apps/web/node_modules as before.
  if (usePackagedResources) {
    env.BLACKBOX_PLAYER_WEB_DEPS_ROOT = path.join(resourcesPath, "cli", "apps", "web");
  }
}
