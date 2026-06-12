export function scenarioFsPath(pathPrefix: string, relativePath: string): string {
  const rel = relativePath.replace(/^\/+/, "");
  return pathPrefix ? `${pathPrefix}/${rel}` : rel;
}
