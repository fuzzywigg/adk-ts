import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Nineteenth leftover (runners residual): `saveInputBlobsAsArtifacts || false`
 * — string `"0"`/`"false"` are truthy and save; `NaN` is falsy and skips.
 * Thirteenth covered numeric 0/false/"true".
 */
describe("runners saveInputBlobs string-zero/false/nan nineteenth leftover", () => {
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
		{ label: "string-zero", value: "0" },
		{ label: "string-false", value: "false" },
	])("saves blobs when flag is truthy $label", async ({ value, label }) => {
		const saveSpy = await runWithFlag(`s-${label}`, value);
		expect(saveSpy).toHaveBeenCalled();
	});

	it("does not save blobs when flag is NaN (falsy)", async () => {
		const saveSpy = await runWithFlag("s-nan", Number.NaN);
		expect(saveSpy).not.toHaveBeenCalled();
	});
});
