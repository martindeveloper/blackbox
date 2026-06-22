import { renderLlmTxt } from "@/lib/llmTxt";

export function GET() {
  return new Response(renderLlmTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
