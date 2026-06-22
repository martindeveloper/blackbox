import fs from "node:fs/promises";
import path from "node:path";
import {
  BUILD_DIR,
  CACHE_DIR,
  HEATMAP_PATH,
  TRASH_DIR,
  TRASH_MANIFEST,
  USER_DIR,
  VCS_CONFIG_PATH,
} from "../../shared/blackboxPaths.js";
import { ProjectError } from "../projectService.js";
import { GitProvider } from "./gitProvider.js";
import { ProcessError } from "./process.js";

const CONFIG_VERSION = 1;
const EXCLUDED_PATHS = new Set([HEATMAP_PATH, TRASH_MANIFEST, ".DS_Store", "Thumbs.db"]);
const EXCLUDED_DIRECTORIES = [BUILD_DIR, CACHE_DIR, TRASH_DIR, USER_DIR];

function isCommitEligible(filePath) {
  if (EXCLUDED_PATHS.has(filePath)) return false;
  return !EXCLUDED_DIRECTORIES.some(
    (directory) => filePath === directory || filePath.startsWith(`${directory}/`),
  );
}

function normalizeConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.version !== CONFIG_VERSION || typeof value.provider !== "string") return null;
  return { version: CONFIG_VERSION, provider: value.provider };
}

function publicError(error) {
  if (error instanceof ProjectError) return error;
  if (error instanceof ProcessError) {
    return new ProjectError("vcs_command_failed", error.message, {
      command: [error.command, ...error.args].join(" "),
    });
  }
  return error;
}

export class VcsService {
  constructor(projectService, providers = [new GitProvider()]) {
    this.projectService = projectService;
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
    this.projectService.setPrepareMutationHook?.((project, changes) =>
      this.prepareMutation(project, changes),
    );
  }

  configPath(project) {
    return path.join(project.path, VCS_CONFIG_PATH);
  }

  async readConfig(project) {
    try {
      const config = normalizeConfig(
        JSON.parse(await fs.readFile(this.configPath(project), "utf8")),
      );
      if (!config) throw new ProjectError("invalid_vcs_config", "Invalid VCS project settings");
      return config;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      if (error instanceof SyntaxError) {
        throw new ProjectError("invalid_vcs_config", "Invalid VCS project settings");
      }
      throw error;
    }
  }

  provider(id) {
    const provider = this.providers.get(id);
    if (!provider) throw new ProjectError("unsupported_vcs", `Unsupported VCS provider: ${id}`);
    return provider;
  }

  async writeConfig(project, providerId) {
    this.provider(providerId);
    const target = this.configPath(project);
    this.projectService.suppress(target);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      `${JSON.stringify({ version: CONFIG_VERSION, provider: providerId }, null, 2)}\n`,
    );
    await this.projectService.indexProject?.(project);
  }

  async status(project) {
    const config = await this.readConfig(project);
    const providers = await Promise.all(
      [...this.providers.values()].map(async (provider) => {
        const availability = await provider.availability();
        return {
          ...provider.descriptor(),
          ...availability,
          detected: availability.available ? await provider.isRepository(project.path) : false,
        };
      }),
    );
    if (!config) {
      const detected = providers.filter((provider) => provider.available && provider.detected);
      if (detected.length !== 1) {
        return { configured: false, provider: null, providers };
      }
      await this.writeConfig(project, detected[0].id);
      return this.configuredStatus(project, this.provider(detected[0].id), providers);
    }
    return this.configuredStatus(project, this.provider(config.provider), providers);
  }

  async configuredStatus(project, provider, providers) {
    const availability = providers.find((item) => item.id === provider.id);
    if (!availability?.available) {
      return {
        configured: true,
        provider: provider.id,
        activeProvider: provider.descriptor(),
        providers,
        unavailable: true,
      };
    }
    if (!availability.detected) {
      return {
        configured: true,
        provider: provider.id,
        activeProvider: provider.descriptor(),
        providers,
        initialized: false,
      };
    }
    const providerStatus = await provider.status(project.path);
    return {
      configured: true,
      provider: provider.id,
      activeProvider: provider.descriptor(),
      providers,
      initialized: true,
      ...providerStatus,
      files: (providerStatus.files ?? []).filter((file) => isCommitEligible(file.path)),
    };
  }

  async configure(project, { provider: providerId, initialize = false } = {}) {
    if (typeof providerId !== "string") {
      throw new ProjectError("invalid_request", "provider is required");
    }
    const provider = this.provider(providerId);
    const availability = await provider.availability();
    if (!availability.available) {
      throw new ProjectError("vcs_unavailable", `${provider.label} is not installed`);
    }
    if (!(await provider.isRepository(project.path))) {
      if (!initialize || !provider.features.initialize) {
        throw new ProjectError("vcs_not_initialized", `${provider.label} is not initialized`);
      }
      await provider.initialize(project.path);
    }
    await this.writeConfig(project, provider.id);
    return this.status(project);
  }

  async requireConfigured(project) {
    const config = await this.readConfig(project);
    if (!config) throw new ProjectError("vcs_not_configured", "Version control is not configured");
    const provider = this.provider(config.provider);
    try {
      const availability = await provider.availability();
      if (!availability.available) {
        throw new ProjectError("vcs_unavailable", `${provider.label} is not installed`);
      }
      if (!(await provider.isRepository(project.path))) {
        throw new ProjectError("vcs_not_initialized", `${provider.label} is not initialized`);
      }
    } catch (error) {
      throw publicError(error);
    }
    return provider;
  }

  async prepareMutation(project, changes) {
    const config = await this.readConfig(project);
    if (!config) return;
    const provider = this.provider(config.provider);
    if (!provider.features.prepareMutation) return;
    try {
      const availability = await provider.availability();
      if (!availability.available) {
        throw new ProjectError("vcs_unavailable", `${provider.label} is not installed`);
      }
      if (!(await provider.isRepository(project.path))) {
        throw new ProjectError("vcs_not_initialized", `${provider.label} is not initialized`);
      }
      await provider.prepareMutation(
        project.path,
        changes.filter((change) => isCommitEligible(change.path)),
      );
    } catch (error) {
      throw publicError(error);
    }
  }

  operation(provider, operationId) {
    const operation = provider.operations[operationId];
    if (!operation) {
      throw new ProjectError(
        "unsupported_vcs_operation",
        `${provider.label} does not support ${operationId}`,
      );
    }
    return operation;
  }

  async execute(project, operationId, payload = {}) {
    const provider = await this.requireConfigured(project);
    const operation = this.operation(provider, operationId);
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    if (operation.requiresMessage && !message) {
      throw new ProjectError("invalid_request", `${operation.label} message is required`);
    }

    try {
      const providerStatus = await provider.status(project.path);
      const operationState = providerStatus.operationStates?.[operationId];
      if (operationState?.enabled === false) {
        throw new ProjectError(
          "vcs_operation_unavailable",
          operationState.reason || `${operation.label} is currently unavailable`,
        );
      }
      const changedPaths = (providerStatus.files ?? [])
        .map((file) => file.path)
        .filter(isCommitEligible);
      const requestedPaths = Array.isArray(payload.paths)
        ? payload.paths
            .map((filePath) => this.projectService.resolvePath(project, filePath).relative)
            .filter(isCommitEligible)
        : [];
      const paths = operation.scope === "selection" ? requestedPaths : changedPaths;
      if (operation.scope === "selection" && paths.length === 0) {
        throw new ProjectError("invalid_request", `${operation.label} requires selected files`);
      }
      if (operation.requiresChanges && paths.length === 0) {
        throw new ProjectError(
          "vcs_nothing_to_record",
          `There are no project changes to ${operation.label.toLowerCase()}`,
        );
      }

      const execute = () =>
        provider.execute(operationId, project.path, {
          message,
          paths,
          status: providerStatus,
        });
      const result = operation.changesWorkspace
        ? await this.projectService.applyExternalMutation(project.id, execute, (output) => ({
            changedPaths: output.changedPaths ?? [],
            source: "vcs",
            contribution:
              output.changedPaths?.length > 0
                ? {
                    status: "applied",
                    contributor: {
                      kind: "integration",
                      name: provider.label,
                    },
                    changeCount: output.changedPaths.length,
                    review: {
                      type: "vcs-diff",
                      provider: provider.id,
                      from: output.before,
                      to: output.after,
                    },
                  }
                : undefined,
          }))
        : await execute();

      return {
        operation: operationId,
        result,
        status: await this.status(project),
      };
    } catch (error) {
      throw publicError(error);
    }
  }

  async history(project, { path: filePath = null, limit = 50 } = {}) {
    const provider = await this.requireConfigured(project);
    if (!provider.features.history) {
      throw new ProjectError("unsupported_vcs_operation", `${provider.label} has no history API`);
    }
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const normalizedPath = filePath
      ? this.projectService.resolvePath(project, filePath).relative
      : null;
    try {
      return {
        revisions: await provider.history(project.path, { path: normalizedPath, limit: safeLimit }),
      };
    } catch (error) {
      throw publicError(error);
    }
  }
}
