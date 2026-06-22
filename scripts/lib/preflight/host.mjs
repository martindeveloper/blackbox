import { commandExistsAsync } from "../spawn.mjs";

/** Per-request cache for host tool probes shared across platform/stage checks. */
export function createHostCache() {
  const commands = new Map();

  return {
    commandExists(command) {
      if (!commands.has(command)) {
        commands.set(command, commandExistsAsync(command));
      }
      return commands.get(command);
    },
  };
}
