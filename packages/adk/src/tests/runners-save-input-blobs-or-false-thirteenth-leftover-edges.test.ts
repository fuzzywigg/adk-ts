import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Thirteenth leftover: `saveInputBlobsAsArtifacts || false` — ""/0/null skip
 * blob saves; 1/"true" are truthy and save.
 */
describe("runners saveInputBlobsAsArtifacts or-false thirteenth leftover", () => {
	let sessionService: InMemorySessionService;
	let artifactService: InMemoryArtifactService;
	let agent: LlmAgent;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		artifactService = new InMemoryArtifactService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
	});

	async function runWithFlag(sessionId: string, flag: unknown) {
		await sessionService.createSession("blob-app", "u1", {}, sessionId);
		const saveSpy = vi.spyOn(artifactService, "saveArtifact");
		const runner = new Runner({
			appName: "blob-app",
			agent,
			sessionService,
			artifactService,
		});
		const runConfig = new RunConfig();
		(runConfig as any).saveInputBlobsAsArtifacts = flag;
		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId,
			newMessage: {
				role: "user",
				parts: [{ inlineData: { mimeType: "text/plain", data: "Zg==" } }],
			},
			runConfig,
		})) {
		}
		return saveSpy;
	}

	it.each([
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: "0", value: 0 },
		{ label: "empty string", value: "" },
		{ label: "false", value: false },
	])("does not save blobs when flag is $label", async ({ value }) => {
		const saveSpy = await runWithFlag(`s-${String(value)}`, value);
		expect(saveSpy).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "true", value: true },
		{ label: "1", value: 1 },
		{ label: "string true", value: "true" },
	])("saves blobs when flag is truthy $label", async ({ value, label }) => {
		const saveSpy = await runWithFlag(`s-${label}`, value);
		expect(saveSpy).toHaveBeenCalled();
	});
});
