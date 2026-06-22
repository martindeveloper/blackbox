export const DEFAULT_MCP_PORT = 47831;
export const MIN_MCP_PORT = 1024;
export const MAX_MCP_PORT = 65535;

export function isValidMcpPort(port) {
  return Number.isInteger(port) && port >= MIN_MCP_PORT && port <= MAX_MCP_PORT;
}
