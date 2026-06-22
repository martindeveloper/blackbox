import { renderLlmFullTxt } from "@/lib/llmFullTxt";

export function GET() {
  return new Response(renderLlmFullTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
