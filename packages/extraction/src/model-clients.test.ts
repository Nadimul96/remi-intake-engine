import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { geminiClient, openAICompatibleClient } from "./model/clients";

/** A local stand-in for the provider APIs, so the HTTP clients are tested without network or keys. */
async function withServer(
  respond: (request: IncomingMessage, body: unknown) => unknown,
  run: (baseUrl: string, seen: { path: string; headers: IncomingMessage["headers"]; body: unknown }[]) => Promise<void>
): Promise<void> {
  const seen: { path: string; headers: IncomingMessage["headers"]; body: unknown }[] = [];
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      const body = JSON.parse(raw);
      seen.push({ path: request.url ?? "", headers: request.headers, body });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(respond(request, body)));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen);
  } finally {
    server.close();
  }
}

const prompt = { system: "be precise", user: "L1: NOI: $1" };

test("Gemini client sends the key in a header and asks for JSON", async () => {
  await withServer(
    () => ({ candidates: [{ content: { parts: [{ text: '{"metrics":' }, { text: "[]}" }] } }] }),
    async (baseUrl, seen) => {
      const client = geminiClient({ provider: "gemini", model: "m", apiKey: "k", baseUrl, timeoutMs: 5000 });
      assert.equal(await client.complete(prompt), '{"metrics":[]}');
      assert.equal(seen[0].path, "/models/m:generateContent");
      assert.equal(seen[0].headers["x-goog-api-key"], "k");
      assert.equal(
        (seen[0].body as { generationConfig: { responseMimeType: string } }).generationConfig.responseMimeType,
        "application/json"
      );
    }
  );
});

test("OpenAI-compatible client works with and without an API key", async () => {
  await withServer(
    () => ({ choices: [{ message: { content: '{"metrics":[]}' } }] }),
    async (baseUrl, seen) => {
      const keyless = openAICompatibleClient({
        provider: "openai",
        model: "llama",
        apiKey: null,
        baseUrl,
        timeoutMs: 5000
      });
      assert.equal(await keyless.complete(prompt), '{"metrics":[]}');
      assert.equal(seen[0].path, "/chat/completions");
      assert.equal(seen[0].headers.authorization, undefined);

      const keyed = openAICompatibleClient({ provider: "openai", model: "gpt", apiKey: "k", baseUrl, timeoutMs: 5000 });
      await keyed.complete(prompt);
      assert.equal(seen[1].headers.authorization, "Bearer k");
    }
  );
});
