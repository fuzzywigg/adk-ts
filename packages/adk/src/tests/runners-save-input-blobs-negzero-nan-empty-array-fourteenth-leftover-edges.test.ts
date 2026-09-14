import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover: `saveInputBlobsAsArtifacts || false` residual after
 * thirteenth — `-0`/`NaN` falsy skip; `[]`/`NEGATIVE_INFINITY` truthy save.
 */
describe("runners saveInputBlobs negzero/nan/empty-array fourteenth leftover", () => {
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
		await sessionService.createSession("blob-app14", "u1", {}, sessionId);
		const saveSpy = vi.spyOn(artifactService, "saveArtifact");
		const runner = new Runner({
			appName: "blob-app14",
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
		{ label: "-0", value: -0 },
		{ label: "NaN", value: Number.NaN },
	])("does not save blobs when flag is falsy $label", async ({
		value,
		label,
	}) => {
		const saveSpy = await runWithFlag(`s-skip-${label}`, value);
		expect(saveSpy).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "empty-array", value: [] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("saves blobs when flag is truthy $label", async ({ value, label }) => {
		const saveSpy = await runWithFlag(`s-save-${label}`, value);
		expect(saveSpy).toHaveBeenCalled();
	});
});
