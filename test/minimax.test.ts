import assert from "node:assert/strict";
import { test } from "node:test";
import { minimax, minimaxFromEnv } from "../src/minimax.ts";

test("posts the prompt to MiniMax and returns the reply", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({ choices: [{ message: { content: "(add 1 2)" } }] }), { status: 200 });
  };
  const model = minimax({ apiKey: "test-key", fetch: fetchImpl });
  assert.equal(await model.complete("goal: one"), "(add 1 2)");
  assert.equal(seen[0]?.url, "https://api.minimax.io/v1/chat/completions");
  const headers = seen[0]?.init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer test-key");
  assert.equal(headers["content-type"], "application/json");
  const body = JSON.parse(String(seen[0]?.init.body)) as {
    model: string;
    reasoning_effort: string;
    max_completion_tokens: number;
    messages: { role: string; content: string }[];
  };
  assert.equal(body.model, "MiniMax-M3.1-Flash");
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.max_completion_tokens, 1024);
  assert.deepEqual(body.messages, [{ role: "user", content: "goal: one" }]);
});

test("reads the key, model, and base url from the environment", async () => {
  const seen: { url: string; body: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push({ url: String(input), body: String(init?.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content: "1" } }] }), { status: 200 });
  };
  const model = minimaxFromEnv(
    { MINIMAX_API_KEY: "env-key", MINIMAX_MODEL: "MiniMax-M3", MINIMAX_BASE_URL: "https://api.minimax.io/v1/" },
    fetchImpl,
  );
  assert.equal(await model.complete("hi"), "1");
  assert.equal(seen[0]?.url, "https://api.minimax.io/v1/chat/completions");
  assert.equal(JSON.parse(seen[0]?.body ?? "{}").model, "MiniMax-M3");
});

test("fails without a key and when MiniMax rejects the call", async () => {
  assert.throws(() => minimaxFromEnv({}), /MINIMAX_API_KEY is missing/);
  const fetchImpl: typeof fetch = async () => new Response("nope", { status: 401 });
  const model = minimax({ apiKey: "test-key", fetch: fetchImpl });
  await assert.rejects(async () => {
    await model.complete("hi");
  }, /MiniMax 401/);
});
