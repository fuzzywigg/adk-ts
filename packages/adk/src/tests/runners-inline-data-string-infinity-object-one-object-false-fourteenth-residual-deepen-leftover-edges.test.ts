import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover residual deepen (complements #254 -0/NaN/[]/neginf):
 * `if (!part.inlineData)` — string `"Infinity"` / `Object(1)` / `Object(false)`
 * are truthy so artifact save still runs.
 */
describe("runners inlineData string-infinity/object-one/object-false fourteenth residual deepen", () => {
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
		await sessionService.createSession("inline-14rd", "u1", {}, sessionId);
		const saveSpy = vi.spyOn(artifactService, "saveArtifact");
		const runner = new Runner({
			appName: "inline-14rd",
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
		{ label: 'string "Infinity"', inlineData: "Infinity" },
		{ label: "Object(1)", inlineData: Object(1) },
		{ label: "Object(false)", inlineData: Object(false) },
	])("saves artifact when inlineData is truthy $label", async ({
		inlineData,
		label,
	}) => {
		const saveSpy = await runInline(`s-save-${label}`, inlineData);
		expect(saveSpy).toHaveBeenCalledTimes(1);
	});
});
