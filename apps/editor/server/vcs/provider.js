export const VCS_OPERATION = Object.freeze({
  SYNC: "sync",
  RECORD: "record",
  PUBLISH: "publish",
  REVERT: "revert",
});

export class VcsProvider {
  constructor({ id, label, workflow, operations, features = {} }) {
    this.id = id;
    this.label = label;
    this.workflow = workflow;
    this.operations = operations;
    this.features = {
      initialize: features.initialize === true,
      prepareMutation: features.prepareMutation === true,
      history: features.history === true,
      checkout: features.checkout === true,
      revert: features.revert === true,
      changelists: features.changelists === true,
      locking: features.locking === true,
      diff: features.diff === true,
    };
  }

  descriptor() {
    return {
      id: this.id,
      label: this.label,
      workflow: this.workflow,
      operations: this.operations,
      features: this.features,
    };
  }

  async availability() {
    throw new Error("availability() is not implemented");
  }

  async isRepository(_projectPath) {
    throw new Error("isRepository() is not implemented");
  }

  async initialize(_projectPath) {
    throw new Error("initialize() is not implemented");
  }

  async status(_projectPath) {
    throw new Error("status() is not implemented");
  }

  async check(projectPath) {
    const status = await this.status(projectPath);
    const behind = Number(status.workspace?.behind ?? 0);
    return {
      status,
      remote: {
        hasChanges: behind > 0,
        changeCount: behind,
        label: status.workspace?.trackingLabel ?? null,
        behind,
      },
    };
  }

  async execute(_operation, _projectPath, _context) {
    throw new Error("execute() is not implemented");
  }

  async prepareMutation(_projectPath, _changes) {}

  async history(_projectPath, _options) {
    throw new Error("history() is not implemented");
  }

  async diff(_projectPath, _path) {
    throw new Error("diff() is not implemented");
  }
}
