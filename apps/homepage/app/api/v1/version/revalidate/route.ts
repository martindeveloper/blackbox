import { revalidateTag } from "next/cache";
import { EDITOR_VERSION_CACHE_TAG } from "@/lib/fetchEditorVersion";

export async function POST(request: Request) {
  const secret = process.env.EDITOR_VERSION_CACHE_REVALIDATE_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag(EDITOR_VERSION_CACHE_TAG, "max");

  return Response.json({
    revalidated: true,
    tag: EDITOR_VERSION_CACHE_TAG,
  });
}
