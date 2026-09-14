import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import { InMemoryRunner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

describe("InMemoryRunner", () => {
	it("constructs with in-memory session, artifact, and memory services", () => {
		const agent = new LlmAgent({
			name: "stub_agent",
			description: "stub",
		});

		const runner = new InMemoryRunner(agent, { appName: "test-app" });

		expect(runner.agent).toBe(agent);
		expect(runner.appName).toBe("test-app");
		expect(runner.sessionService).toBeInstanceOf(InMemorySessionService);
		expect(runner.artifactService).toBeInstanceOf(InMemoryArtifactService);
		expect(runner.memoryService).toBeInstanceOf(InMemoryMemoryService);
	});

	it("defaults appName to InMemoryRunner", () => {
		const agent = new LlmAgent({ name: "default_app_agent" });
		const runner = new InMemoryRunner(agent);
		expect(runner.appName).toBe("InMemoryRunner");
	});

	it("runs end-to-end with the default in-memory wiring", async () => {
		const agent = new LlmAgent({
			name: "e2e_agent",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent);
		const session = await runner.sessionService.createSession(
			"InMemoryRunner",
			"u1",
			{},
			"s-e2e",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "e2e_agent",
				content: { role: "model", parts: [{ text: "e2e-ok" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: session.id,
			newMessage: { role: "user", parts: [{ text: "ping" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("e2e-ok");
		const updated = await runner.sessionService.getSession(
			"InMemoryRunner",
			"u1",
			"s-e2e",
		);
		expect(updated?.events.some((e) => e.author === "user")).toBe(true);
		expect(updated?.events.some((e) => e.author === "e2e_agent")).toBe(true);
	});

	it("saves input blobs via the built-in artifact service", async () => {
		const agent = new LlmAgent({
			name: "blob_agent",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent, { appName: "blob-app" });
		const saveSpy = vi.spyOn(
			runner.artifactService as InMemoryArtifactService,
			"saveArtifact",
		);
		const session = await runner.sessionService.createSession(
			"blob-app",
			"u1",
			{},
			"s-blob",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "blob_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: session.id,
			newMessage: {
				role: "user",
				parts: [
					{
						inlineData: {
							mimeType: "text/plain",
							data: "YQ==",
						},
					},
				],
			},
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: true }),
		})) {
			// drain
		}

		expect(saveSpy).toHaveBeenCalledTimes(1);
	});
});
