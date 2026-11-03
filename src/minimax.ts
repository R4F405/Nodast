import type { Model } from "./contract.ts";

const DEFAULT_MODEL = "MiniMax-M3.1-Flash";
const DEFAULT_BASE_URL = "https://api.minimax.io/v1";

export type MiniMaxOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export function minimax(options: MiniMaxOptions): Model {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const model = options.model ?? DEFAULT_MODEL;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  return {
    async complete(prompt: string): Promise<string> {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_completion_tokens: 1024,
          reasoning_effort: "low",
        }),
      });
      if (!response.ok) throw new Error(`MiniMax ${response.status}`);
      const body = (await response.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim() === "") throw new Error("MiniMax returned an empty reply");
      return content;
    },
  };
}

export function minimaxFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): Model {
  const apiKey = env.MINIMAX_API_KEY;
  if (apiKey === undefined || apiKey === "") throw new Error("MINIMAX_API_KEY is missing");
  return minimax({
    apiKey,
    ...(env.MINIMAX_MODEL !== undefined && env.MINIMAX_MODEL !== "" ? { model: env.MINIMAX_MODEL } : {}),
    ...(env.MINIMAX_BASE_URL !== undefined && env.MINIMAX_BASE_URL !== "" ? { baseUrl: env.MINIMAX_BASE_URL } : {}),
    ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
  });
}
