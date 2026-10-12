import assert from "node:assert/strict";
import test from "node:test";

import { extractCandidates } from "./extract";
import { type ModelClient, type ModelPrompt, modelConfigFromEnv } from "./model/clients";
import type { MetricFactValue } from "./rules/fact-draft";
import { loadFixtureArtifacts } from "./test-support";

/** A scripted stand-in for an LLM: replies with canned JSON and records the prompt it saw. */
function fakeClient(reply: (prompt: ModelPrompt) => unknown): ModelClient & { prompts: ModelPrompt[] } {
  const prompts: ModelPrompt[] = [];
  return {
    label: "fake:model",
    prompts,
    async complete(prompt) {
      prompts.push(prompt);
      const value = reply(prompt);
      return typeof value === "string" ? value : JSON.stringify(value);
    }
  };
}

function artifact(fileName: string) {
  const found = loadFixtureArtifacts().find((item) => item.context.fileName === fileName);
  assert.ok(found, `fixture ${fileName} missing`);
  return found.context;
}

/** Line id the prompt assigned to the first line containing `needle`. */
function lineId(prompt: ModelPrompt, needle: string): string {
  const line = prompt.user.split("\n").find((text) => /^L\d+: /.test(text) && text.includes(needle));
  assert.ok(line, `no prompt line contains ${needle}`);
  return line.split(":")[0];
}

const siteVisit = "SiteVisit_Parkside_2018_DF.txt";

test("a grounded proposal becomes a model_assisted candidate cited to its line", async () => {
  // "91% occupied" in the broker email has no "Label: value" shape, so the rules miss it.
  const client = fakeClient((prompt) => ({
    metrics: [
      {
        metric: "physical_occupancy",
        value: 91,
        period: null,
        line: lineId(prompt, "91% occupied"),
        quote: "91% occupied"
      }
    ]
  }));
  const result = await extractCandidates(artifact("Thread_01_Broker_Oakwood_Intro.txt"), { modelClient: client });
  const proposed = result.drafts.filter((draft) => draft.extractionMethod === "model_assisted");

  assert.equal(result.model.proposed, 1);
  assert.equal(proposed.length, 1);
  const fact = proposed[0].candidateValue as MetricFactValue;
  assert.deepEqual([fact.metric, fact.value, fact.asset], ["physical_occupancy", 91, "Oakwood Commons"]);
  assert.equal(proposed[0].extractionMethodDetail, "fake:model");
  assert.equal(proposed[0].citationPacket.provenanceAnchorIds.length, 1);
  assert.match(proposed[0].citationPacket.evidencePreview, /91% occupied/);
});

test("proposals that are not grounded in the cited line are discarded", async () => {
  const client = fakeClient((prompt) => {
    const landscaping = lineId(prompt, "annual landscaping contract");
    return {
      metrics: [
        { metric: "noi", value: 999999, period: "FY2018", line: landscaping, quote: "$34,200/year" },
        { metric: "noi", value: 34200, period: "FY2018", line: "L9999", quote: "$34,200/year" },
        { metric: "noi", value: 43200, period: "FY2018", line: landscaping, quote: "$43,200 per year" },
        { metric: "favorite_color", value: 1, period: null, line: landscaping, quote: "$34,200" },
        { metric: "noi", value: "34200", line: landscaping, quote: "$34,200" }
      ]
    };
  });
  const result = await extractCandidates(artifact(siteVisit), { modelClient: client });

  assert.equal(result.model.proposed, 0);
  assert.equal(result.model.rejected, 5);
  assert.equal(
    result.drafts.some((draft) => draft.extractionMethod === "model_assisted"),
    false
  );
});

test("rule-based facts win over duplicate model proposals", async () => {
  const pmReport = artifact("PM_Report_Parkside_Q3_2017.txt");
  const client = fakeClient((prompt) => ({
    metrics: [
      { metric: "noi", value: 264850, period: "Q3 2017", line: lineId(prompt, "NOI: $264,850"), quote: "$264,850" }
    ]
  }));
  const result = await extractCandidates(pmReport, { modelClient: client });
  assert.equal(result.model.proposed, 0);
  assert.equal(result.drafts.filter((draft) => draft.fieldName === "metric.noi").length, 1);
});

test("a failing or malformed model reply degrades to warnings, never an error", async () => {
  const broken = fakeClient(() => "I could not find anything, sorry.");
  const result = await extractCandidates(artifact(siteVisit), { modelClient: broken });
  assert.equal(result.model.proposed, 0);
  assert.deepEqual(result.model.warnings, ["model reply was not the expected JSON shape"]);

  const offline: ModelClient = {
    label: "fake:offline",
    complete: () => Promise.reject(new Error("network down"))
  };
  const offlineResult = await extractCandidates(artifact(siteVisit), { modelClient: offline });
  assert.match(offlineResult.model.warnings[0], /network down/);
  assert.ok(offlineResult.drafts.length > 0, "rule-based candidates are still returned");
});

test("without a model client, extraction is rule-based only", async () => {
  const result = await extractCandidates(artifact(siteVisit));
  assert.equal(result.model.used, false);
});

test("model configuration is read from the environment and off by default", () => {
  assert.equal(modelConfigFromEnv({}), null);
  assert.equal(modelConfigFromEnv({ MODEL_EXTRACTION: "off" }), null);
  assert.throws(() => modelConfigFromEnv({ MODEL_EXTRACTION: "gemini" }), /GEMINI_API_KEY/);

  const gemini = modelConfigFromEnv({ MODEL_EXTRACTION: "gemini", GEMINI_API_KEY: "test-key" });
  assert.equal(gemini?.provider, "gemini");
  assert.equal(gemini?.model, "gemini-3.5-flash-lite");

  const ollama = modelConfigFromEnv({
    MODEL_EXTRACTION: "openai",
    OPENAI_COMPATIBLE_BASE_URL: "http://127.0.0.1:11434/v1/",
    OPENAI_COMPATIBLE_MODEL: "llama3.2"
  });
  assert.deepEqual([ollama?.baseUrl, ollama?.apiKey], ["http://127.0.0.1:11434/v1", null]);
});

test("live provider: every model-assisted candidate quotes its cited line (opt-in: REMI_LIVE_MODEL_TESTS=1)", {
  skip: process.env.REMI_LIVE_MODEL_TESTS !== "1"
}, async () => {
  const { createModelClient } = await import("./model/clients");
  const config = modelConfigFromEnv(process.env);
  assert.ok(config, "set MODEL_EXTRACTION and its provider variables");
  const result = await extractCandidates(artifact("Thread_01_Broker_Oakwood_Intro.txt"), {
    modelClient: createModelClient(config)
  });
  for (const draft of result.drafts.filter((item) => item.extractionMethod === "model_assisted")) {
    const quote = String(draft.citationPacket.extractionMetadata.modelQuote).toLowerCase();
    assert.ok(draft.citationPacket.evidencePreview.toLowerCase().includes(quote));
  }
});
