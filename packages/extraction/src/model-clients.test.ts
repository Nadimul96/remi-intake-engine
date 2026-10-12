import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { extractCandidates } from "./extract";
import { createModelClient, geminiClient, ModelAuthError, openAICompatibleClient } from "./model/clients";
import { loadFixtureArtifacts } from "./test-support";

/** A local stand-in for the provider APIs, so the HTTP clients are tested without network or keys. */
async function withServer(
  respond: (request: IncomingMessage, body: unknown) => unknown,
  run: (baseUrl: string, seen: { path: string; headers: IncomingMessage["headers"]; body: unknown }[]) => Promise<void>,
  status = 200
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
      response.statusCode = status;
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

/** What Gemini returns for a key that does not exist. */
const GEMINI_INVALID_KEY = {
  error: {
    code: 400,
    message: "API key not valid. Please pass a valid API key.",
    status: "INVALID_ARGUMENT",
    details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }]
  }
};

test("a rejected key is logged once, then extraction falls back to rules without more requests", async () => {
  await withServer(
    () => GEMINI_INVALID_KEY,
    async (baseUrl, seen) => {
      const logged: string[] = [];
      const client = createModelClient(
        { provider: "gemini", model: "m", apiKey: "not-a-real-key", baseUrl, timeoutMs: 5000 },
        (message) => logged.push(message)
      );
      const documents = loadFixtureArtifacts().slice(0, 3);
      for (const { context } of documents) {
        const rulesOnly = await extractCandidates(context);
        const result = await extractCandidates(context, { modelClient: client });
        assert.equal(result.drafts.length, rulesOnly.drafts.length, `${context.fileName} lost rule-based candidates`);
        assert.equal(result.model.proposed, 0);
        assert.match(result.model.warnings.join("\n"), /gemini rejected the API key/);
      }

      assert.equal(seen.length, 1, "requests after the first rejection should not reach the provider");
      assert.equal(logged.length, 1);
      assert.match(
        logged[0],
        /^Model-assisted extraction disabled: gemini rejected the API key \(HTTP 400: API key not valid/
      );
      assert.match(logged[0], /GEMINI_API_KEY .*aistudio\.google\.com.*MODEL_EXTRACTION=off/);
      assert.doesNotMatch(logged[0], /not-a-real-key/);
    },
    400
  );
});

test("concurrent requests rejected for the same key log once", async () => {
  await withServer(
    () => GEMINI_INVALID_KEY,
    async (baseUrl, seen) => {
      const logged: string[] = [];
      const client = createModelClient(
        { provider: "gemini", model: "m", apiKey: "not-a-real-key", baseUrl, timeoutMs: 5000 },
        (message) => logged.push(message)
      );
      const outcomes = await Promise.allSettled([1, 2, 3].map(() => client.complete(prompt)));
      assert.ok(outcomes.every((outcome) => outcome.status === "rejected"));
      assert.equal(seen.length, 3);
      assert.equal(logged.length, 1);
    },
    400
  );
});

test("other HTTP errors are reported per request and do not disable the model", async () => {
  await withServer(
    () => ({ error: { message: "model is overloaded" } }),
    async (baseUrl, seen) => {
      const logged: string[] = [];
      const client = createModelClient(
        { provider: "openai", model: "llama", apiKey: null, baseUrl, timeoutMs: 5000 },
        (message) => logged.push(message)
      );
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await assert.rejects(
          client.complete(prompt),
          (error: Error) => !(error instanceof ModelAuthError) && /HTTP 503: model is overloaded/.test(error.message)
        );
      }
      assert.equal(seen.length, 2);
      assert.deepEqual(logged, []);
    },
    503
  );
});
