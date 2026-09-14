import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Eleventh leftover: `if (!newMessage.parts)` only trips on missing/falsy
 * parts (empty array is truthy). `if (!part.inlineData)` skips falsy blobs
 * even when saveInputBlobsAsArtifacts is true.
 */
describe("runners newMessage.parts + inlineData falsy eleventh leftover", () => {
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

	it("empty parts array is truthy so append does not throw", async () => {
		await sessionService.createSession("parts-app", "u1", {}, "s-empty-parts");
		const runner = new Runner({
			appName: "parts-app",
			agent,
			sessionService,
		});
		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-empty-parts",
			newMessage: { role: "user", parts: [] },
		})) {
			events.push(event);
		}
		expect(events).toHaveLength(1);
		const session = await sessionService.getSession(
			"parts-app",
			"u1",
			"s-empty-parts",
		);
		expect(session?.events.some((e) => e.author === "user")).toBe(true);
	});

	it.each([
		{ label: "undefined", parts: undefined },
		{ label: "null", parts: null },
		{ label: "0", parts: 0 },
		{ label: "false", parts: false },
		{ label: "empty string", parts: "" },
	])("throws No parts when parts is $label", async ({ parts }) => {
		await sessionService.createSession(
			"parts-app",
			"u1",
			{},
			`s-falsy-parts-${String(parts)}`,
		);
		const runner = new Runner({
			appName: "parts-app",
			agent,
			sessionService,
		});
		const gen = runner.runAsync({
			userId: "u1",
			sessionId: `s-falsy-parts-${String(parts)}`,
			newMessage: { role: "user", parts: parts as any },
		});
		await expect(gen.next()).rejects.toThrow("No parts in the new_message.");
	});

	it.each([
		{ label: "empty string", inlineData: "" },
		{ label: "null", inlineData: null },
		{ label: "false", inlineData: false },
		{ label: "0", inlineData: 0 },
	])("skips artifact save when inlineData is $label", async ({
		inlineData,
		label,
	}) => {
		const sessionId = `s-inline-${label.replace(/\s+/g, "-")}`;
		await sessionService.createSession("parts-app", "u1", {}, sessionId);
		const saveSpy = vi.spyOn(artifactService, "saveArtifact");
		const runner = new Runner({
			appName: "parts-app",
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
			// drain
		}
		expect(saveSpy).not.toHaveBeenCalled();
	});

	it("empty-object inlineData is truthy so saveArtifact still runs", async () => {
		await sessionService.createSession("parts-app", "u1", {}, "s-inline-obj");
		const saveSpy = vi.spyOn(artifactService, "saveArtifact");
		const runner = new Runner({
			appName: "parts-app",
			agent,
			sessionService,
			artifactService,
		});
		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-inline-obj",
			newMessage: {
				role: "user",
				parts: [{ inlineData: {} } as any],
			},
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: true }),
		})) {
			// drain
		}
		expect(saveSpy).toHaveBeenCalledTimes(1);
	});
});
