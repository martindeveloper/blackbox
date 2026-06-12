export const API_VERSION = "v1" as const;

export const API_BASE = `/api/${API_VERSION}`;

export const enum Api {
  Projects = "/api/v1/projects",
  Prefs = "/api/v1/prefs",
}
