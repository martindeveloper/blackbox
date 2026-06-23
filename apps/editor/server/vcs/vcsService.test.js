import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { VCS_CONFIG_PATH } from "../../shared/blackboxPaths.js";
import { VcsProvider } from "./provider.js";
import { VcsService } from "./vcsService.js";

class CentralizedProvider extends VcsProvider {
  constructor({
    id = "central",
    label = "Central",
    initialized = true,
    canInitialize = false,
  } = {}) {
    super({
      id,
      label,
      workflow: "centralized",
      operations: {
        sync: {
          label: "Sync",
          busyLabel: "Syncing…",
          successMessage: "Workspace synced.",
          placement: "footer",
          scope: "workspace",
          changesWorkspace: true,
          requiresCleanEditor: true,
        },
        record: {
          label: "Submit",
          busyLabel: "Submitting…",
          successMessage: "Changes submitted.",
          placement: "primary",
          scope: "changes",
          requiresMessage: true,
          messagePlaceholder: "Changelist description",
          requiresChanges: true,
        },
        checkout: {
          label: "Open for edit",
          busyLabel: "Opening…",
          successMessage: "File opened for edit.",
          placement: "file",
          scope: "selection",
        },
      },
      features: {
        initialize: canInitialize,
        prepareMutation: true,
        history: true,
        checkout: true,
        revert: true,
        changelists: true,
        locking: true,
      },
    });
    this.initialized = initialized;
    this.files = [];
    this.executions = [];
    this.preparedChanges = [];
  }

  async availability() {
    return { available: true, version: "1.0" };
  }

  async isRepository() {
    return this.initialized;
  }

  async initialize() {
    this.initialized = true;
  }

  async status() {
    return {
      workspace: { label: "workspace-main", trackingLabel: "//depot/story" },
      files: this.files,
    };
  }

  async execute(operation, _projectPath, context) {
    this.executions.push({ operation, context });
    if (operation === "sync") {
      return {
        before: "41",
        after: "42",
        changedPaths: ["scenario.json"],
      };
    }
    return { revision: { id: "42", summary: context.message } };
  }

  async prepareMutation(_projectPath, changes) {
    this.preparedChanges.push(...changes);
  }

  async history() {
    return [];
  }
}

class DistributedProvider extends VcsProvider {
  constructor() {
    super({
      id: "distributed",
      label: "Distributed",
      workflow: "distributed",
      operations: {
        record: {
          label: "Commit",
          busyLabel: "Committing…",
          successMessage: "Changes committed.",
          placement: "primary",
          scope: "changes",
          requiresMessage: true,
          requiresChanges: true,
        },
        publish: {
          label: "Push",
          busyLabel: "Pushing…",
          successMessage: "Changes pushed.",
          placement: "footer",
          scope: "workspace",
        },
      },
      features: { initialize: true, history: true },
    });
    this.files = [{ path: "scenario.json", status: "modified" }];
    this.executions = [];
    this.behind = 0;
  }

  async availability() {
    return { available: true, version: "1.0" };
  }

  async isRepository() {
    return true;
  }

  async initialize() {}

  async status() {
    return {
      workspace: { label: "main", trackingLabel: "origin/main", ahead: 0, behind: this.behind },
      files: this.files,
      operationStates: {
        record: { enabled: true, reason: null },
        publish: { enabled: true, reason: null },
      },
    };
  }

  async execute(operation, _projectPath, context) {
    this.executions.push({ operation, context });
    if (operation === "record") this.files = [];
    return { operation };
  }

  async history() {
    return [];
  }
}

function serviceFixture(providers) {
  const suppressed = [];
  const emitted = [];
  let prepareMutationHook = null;
  const projectService = {
    suppress: (target) => suppressed.push(target),
    resolvePath: (_project, filePath) => ({ relative: filePath }),
    setPrepareMutationHook: (hook) => {
      prepareMutationHook = hook;
    },
    applyExternalMutation: async (_id, operation, eventForResult) => {
      const result = await operation();
      emitted.push(eventForResult(result));
      return result;
    },
  };
  return {
    service: new VcsService(projectService, providers),
    suppressed,
    emitted,
    prepareMutation: (...args) => prepareMutationHook(...args),
  };
}

test("auto-configures the only detected provider when vcs.json is absent", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-vcs-detected-"));
  const project = { id: "project", path: projectPath };
  const provider = new CentralizedProvider();
  const { service } = serviceFixture([provider]);
  try {
    const status = await service.status(project);
    assert.equal(status.configured, true);
    assert.equal(status.provider, "central");
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(projectPath, VCS_CONFIG_PATH), "utf8")),
      { version: 1, provider: "central" },
    );
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("keeps vcs.json authoritative when another provider is also detected", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-vcs-priority-"));
  const project = { id: "project", path: projectPath };
  await fs.mkdir(path.dirname(path.join(projectPath, VCS_CONFIG_PATH)), { recursive: true });
  await fs.writeFile(
    path.join(projectPath, VCS_CONFIG_PATH),
    `${JSON.stringify({ version: 1, provider: "central" }, null, 2)}\n`,
  );
  const central = new CentralizedProvider();
  const other = new CentralizedProvider({ id: "other", label: "Other" });
  const { service } = serviceFixture([central, other]);
  try {
    const status = await service.status(project);
    assert.equal(status.provider, "central");
    assert.equal(status.activeProvider.label, "Central");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("initializes the selected provider for a project without VCS", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-vcs-initialize-"));
  const project = { id: "project", path: projectPath };
  const provider = new CentralizedProvider({
    id: "local",
    label: "Local",
    initialized: false,
    canInitialize: true,
  });
  const { service } = serviceFixture([provider]);
  try {
    const before = await service.status(project);
    assert.equal(before.configured, false);
    assert.equal(before.providers[0].detected, false);

    const after = await service.configure(project, { provider: "local", initialize: true });
    assert.equal(after.configured, true);
    assert.equal(after.provider, "local");
    assert.equal(after.initialized, true);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("stores only provider settings and exposes centralized capabilities", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-vcs-service-"));
  const project = { id: "project", path: projectPath };
  const provider = new CentralizedProvider();
  const fixture = serviceFixture([provider]);
  const { service, suppressed, emitted } = fixture;
  try {
    const status = await service.configure(project, { provider: "central" });
    assert.equal(status.provider, "central");
    assert.equal(status.activeProvider.workflow, "centralized");
    assert.equal(status.activeProvider.operations.record.label, "Submit");
    assert.equal(status.activeProvider.operations.publish, undefined);
    assert.equal(status.activeProvider.operations.checkout.scope, "selection");
    assert.equal(status.activeProvider.features.locking, true);
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(projectPath, VCS_CONFIG_PATH), "utf8")),
      { version: 1, provider: "central" },
    );
    assert.equal(suppressed.length, 1);

    await fixture.prepareMutation(project, [
      { path: "scenario.json", action: "edit" },
      { path: ".blackbox/user/tools.json", action: "edit" },
    ]);
    assert.deepEqual(provider.preparedChanges, [{ path: "scenario.json", action: "edit" }]);

    provider.files = [
      { path: "scenario.json", status: "modified" },
      { path: ".blackbox/build/debug/game.js", status: "untracked" },
      { path: ".blackbox/user/tools.json", status: "modified" },
    ];
    const submitted = await service.execute(project, "record", {
      message: "Submit story",
    });
    assert.equal(submitted.operation, "record");
    assert.deepEqual(provider.executions[0], {
      operation: "record",
      context: {
        message: "Submit story",
        paths: ["scenario.json"],
        status: {
          workspace: { label: "workspace-main", trackingLabel: "//depot/story" },
          files: provider.files,
        },
      },
    });

    const synced = await service.execute(project, "sync");
    assert.equal(synced.operation, "sync");
    assert.deepEqual(emitted, [
      {
        changedPaths: ["scenario.json"],
        source: "vcs",
        contribution: {
          status: "applied",
          contributor: { kind: "integration", name: "Central" },
          changeCount: 1,
          review: {
            type: "vcs-diff",
            provider: "central",
            from: "41",
            to: "42",
          },
        },
      },
    ]);

    await service.execute(project, "checkout", { paths: ["scenario.json"] });
    assert.deepEqual(provider.executions.at(-1), {
      operation: "checkout",
      context: {
        message: "",
        paths: ["scenario.json"],
        status: {
          workspace: { label: "workspace-main", trackingLabel: "//depot/story" },
          files: provider.files,
        },
      },
    });

    await assert.rejects(
      service.execute(project, "publish"),
      (error) => error.code === "unsupported_vcs_operation",
    );
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("author sync records centralized changes without a separate publish step", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-vcs-author-central-"));
  const project = { id: "project", path: projectPath };
  const provider = new CentralizedProvider();
  const { service } = serviceFixture([provider]);
  try {
    await service.configure(project, { provider: "central" });
    provider.files = [{ path: "scenario.json", status: "modified" }];

    const synced = await service.authorSync(project, { message: "Update intro" });

    assert.equal(synced.ok, true);
    assert.deepEqual(
      provider.executions.map((execution) => execution.operation),
      ["record"],
    );
    assert.equal(provider.executions[0].context.message, "Update intro");
    assert.deepEqual(provider.executions[0].context.paths, ["scenario.json"]);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("author sync publishes distributed changes after recording them", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-vcs-author-distributed-"));
  const project = { id: "project", path: projectPath };
  const provider = new DistributedProvider();
  const { service } = serviceFixture([provider]);
  try {
    await service.configure(project, { provider: "distributed" });

    const synced = await service.authorSync(project, { message: "Update scenario" });

    assert.equal(synced.ok, true);
    assert.deepEqual(
      provider.executions.map((execution) => execution.operation),
      ["record", "publish"],
    );
    assert.equal(provider.executions[0].context.message, "Update scenario");
    assert.deepEqual(provider.executions[0].context.paths, ["scenario.json"]);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("checks provider remote state without changing the workspace", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-vcs-check-"));
  const project = { id: "project", path: projectPath };
  const provider = new DistributedProvider();
  const { service } = serviceFixture([provider]);
  try {
    await service.configure(project, { provider: "distributed" });
    provider.behind = 2;

    const checked = await service.check(project);

    assert.equal(checked.provider, "distributed");
    assert.equal(checked.remote.hasChanges, true);
    assert.equal(checked.remote.changeCount, 2);
    assert.equal(checked.status.workspace.behind, 2);
    assert.deepEqual(provider.executions, []);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});
