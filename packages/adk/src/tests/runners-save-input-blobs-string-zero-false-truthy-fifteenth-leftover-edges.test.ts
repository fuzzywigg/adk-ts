import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip #254 / 96457a9): residual after fourteenth `-0`/`NaN`/`[]` — string `"0"` /
 * `"false"` are truthy via `saveInputBlobsAsArtifacts || false` and save blobs.
 */
describe("runners saveInputBlobs string-zero/false truthy fifteenth leftover", () => {
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
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("saves blobs when flag is truthy string $label", async ({
		value,
		label,
	}) => {
		const saveSpy = await runWithFlag(`s-${label}`, value);
		expect(saveSpy).toHaveBeenCalled();
	});

	it("empty string still skips (thirteenth control)", async () => {
		const saveSpy = await runWithFlag("s-empty", "");
		expect(saveSpy).not.toHaveBeenCalled();
	});
});
