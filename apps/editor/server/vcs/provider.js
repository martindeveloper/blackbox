export const VCS_OPERATION = Object.freeze({
  SYNC: "sync",
  RECORD: "record",
  PUBLISH: "publish",
});

/**
 * Provider contract for version control.
 *
 * Shared code speaks in workflow semantics:
 * - sync: update the workspace from its authoritative source
 * - record: create a revision (local commit or remote submit/check-in)
 * - publish: send local revisions to the authoritative source, when applicable
 */
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

  async execute(_operation, _projectPath, _context) {
    throw new Error("execute() is not implemented");
  }

  async prepareMutation(_projectPath, _changes) {}

  async history(_projectPath, _options) {
    throw new Error("history() is not implemented");
  }
}
