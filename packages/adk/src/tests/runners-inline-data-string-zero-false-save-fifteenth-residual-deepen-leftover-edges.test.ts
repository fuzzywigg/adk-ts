import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fifteenth residual deepen (HEAVY tip-relaunch residual after tip 1f70668 (post #282/#284); supersedes closed #281/#285/#273/#262
 * `if (!part.inlineData)` residual beyond fourteenth `-0`/`NaN`/`[]` /
 * `NEGATIVE_INFINITY` — string `"0"` / `"false"` are truthy so artifacts save.
 */
describe("runners inlineData string-zero/false save fifteenth residual deepen", () => {
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
		await sessionService.createSession("inline-15", "u1", {}, sessionId);
		const saveSpy = vi.spyOn(artifactService, "saveArtifact");
		const runner = new Runner({
			appName: "inline-15",
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
		{ label: '"0"', inlineData: "0" },
		{ label: '"false"', inlineData: "false" },
	])("saves artifact when inlineData is truthy string $label", async ({
		inlineData,
		label,
	}) => {
		const saveSpy = await runInline(`s-save-${label}`, inlineData);
		expect(saveSpy).toHaveBeenCalledTimes(1);
	});
});
