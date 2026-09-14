import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover (HEAVY tip-relaunch residual after #243):
 * `if (!part.inlineData)` residual after eleventh classic falsy —
 * `-0`/`NaN` skip save; `[]`/`NEGATIVE_INFINITY` truthy still save.
 */
describe("runners inlineData negzero/nan/empty-array fourteenth leftover", () => {
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
				content: { role: "model", parts: [{ text: "done" }] },
			});
		});
	});

	async function runInline(sessionId: string, inlineData: unknown) {
		await sessionService.createSession("inline-14h", "u1", {}, sessionId);
		const saveSpy = vi.spyOn(artifactService, "saveArtifact");
		const runner = new Runner({
			appName: "inline-14h",
			agent,
			sessionService,
			artifactService,
		});
		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId,
			newMessage: {
				role: "user",
				parts: [{ inlineData } as any],
			},
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: true }),
		})) {
		}
		return saveSpy;
	}

	it.each([
		{ label: "-0", inlineData: -0 },
		{ label: "NaN", inlineData: Number.NaN },
	])("skips artifact save when inlineData is falsy $label", async ({
		inlineData,
		label,
	}) => {
		const saveSpy = await runInline(`s-skip-${label}`, inlineData);
		expect(saveSpy).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "empty-array", inlineData: [] },
		{ label: "NEGATIVE_INFINITY", inlineData: Number.NEGATIVE_INFINITY },
	])("saves artifact when inlineData is truthy $label", async ({
		inlineData,
		label,
	}) => {
		const saveSpy = await runInline(`s-save-${label}`, inlineData);
		expect(saveSpy).toHaveBeenCalledTimes(1);
	});
});
