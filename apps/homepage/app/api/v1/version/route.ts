import { fetchEditorVersion } from "../../../../src/lib/fetchEditorVersion";

export async function GET() {
  const editor = await fetchEditorVersion();
  return Response.json({ editor });
}
