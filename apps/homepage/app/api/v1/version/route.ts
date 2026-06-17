import { editorApiCorsHeaders } from "@/lib/editorApiCors";
import { fetchEditorVersion } from "@/lib/fetchEditorVersion";

export async function GET(request: Request) {
  const editor = await fetchEditorVersion();
  return Response.json({ editor }, { headers: editorApiCorsHeaders(request) });
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: editorApiCorsHeaders(request) });
}
