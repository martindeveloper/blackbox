const EDITOR_ORIGIN = "blackbox://editor";

function isAllowedOrigin(origin: string): boolean {
  return (
    origin === EDITOR_ORIGIN ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  );
}

export function editorApiCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept",
    Vary: "Origin",
  };
}
