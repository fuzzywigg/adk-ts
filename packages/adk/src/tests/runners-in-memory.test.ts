import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import { BasePlugin } from "../plugins/base-plugin";
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

	it("accepts an empty options object and keeps the default app name", () => {
		const agent = new LlmAgent({ name: "empty_opts" });
		const runner = new InMemoryRunner(agent, {});
		expect(runner.appName).toBe("InMemoryRunner");
		expect(runner.sessionService).toBeInstanceOf(InMemorySessionService);
		expect(runner.artifactService).toBeInstanceOf(InMemoryArtifactService);
		expect(runner.memoryService).toBeInstanceOf(InMemoryMemoryService);
	});

	it("throws when runAsync targets a missing session", async () => {
		const agent = new LlmAgent({
			name: "missing_sess",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent, { appName: "miss-app" });
		const gen = runner.runAsync({
			userId: "u1",
			sessionId: "does-not-exist",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		});
		await expect(gen.next()).rejects.toThrow(
			/Session not found: does-not-exist/,
		);
	});

	it("short-circuits via a plugin beforeRunCallback without running the agent", async () => {
		class EarlyExitPlugin extends BasePlugin {
			async beforeRunCallback() {
				return new Event({
					author: "plugin",
					content: { role: "model", parts: [{ text: "early-inmem" }] },
				});
			}
		}

		const agent = new LlmAgent({
			name: "plugin_agent",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent, {
			appName: "plugin-app",
			plugins: [new EarlyExitPlugin("early")],
		});
		const session = await runner.sessionService.createSession(
			"plugin-app",
			"u1",
			{},
			"s-early",
		);
		const agentSpy = vi
			.spyOn(agent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "plugin_agent",
					content: { role: "model", parts: [{ text: "should-not-run" }] },
				});
			});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: session.id,
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(agentSpy).not.toHaveBeenCalled();
		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("early-inmem");
	});

	it("close delegates to the wired plugin manager", async () => {
		const agent = new LlmAgent({ name: "close_agent" });
		const runner = new InMemoryRunner(agent, { appName: "close-app" });
		const closeSpy = vi
			.spyOn(runner.pluginManager, "close")
			.mockResolvedValue(undefined);
		await runner.close();
		expect(closeSpy).toHaveBeenCalledTimes(1);
	});

	it("sync run drains events through the in-memory session service", async () => {
		const agent = new LlmAgent({
			name: "sync_inmem",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent, { appName: "sync-app" });
		const session = await runner.sessionService.createSession(
			"sync-app",
			"u1",
			{},
			"s-sync",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "sync_inmem",
				content: { role: "model", parts: [{ text: "sync-inmem-ok" }] },
			});
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: session.id,
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(async () => {
			const updated = await runner.sessionService.getSession(
				"sync-app",
				"u1",
				"s-sync",
			);
			expect(
				updated?.events.some(
					(e) =>
						e.author === "sync_inmem" &&
						e.content?.parts?.[0]?.text === "sync-inmem-ok",
				),
			).toBe(true);
		});

		const events = [...generator];
		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("sync-inmem-ok");
	});

	it("rewinds state using the built-in in-memory artifact and session services", async () => {
		const agent = new LlmAgent({
			name: "rewind_inmem",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent, { appName: "rewind-app" });
		const session = await runner.sessionService.createSession(
			"rewind-app",
			"u1",
			{},
			"s-rewind",
		);

		await runner.artifactService?.saveArtifact({
			appName: "rewind-app",
			userId: "u1",
			sessionId: "s-rewind",
			filename: "note",
			artifact: { text: "v0" },
		});
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv1",
				author: "rewind_inmem",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					stateDelta: { k: "v1" },
					artifactDelta: { note: 0 },
				}),
			}),
		);

		await runner.artifactService?.saveArtifact({
			appName: "rewind-app",
			userId: "u1",
			sessionId: "s-rewind",
			filename: "note",
			artifact: { text: "v1" },
		});
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv2",
				author: "rewind_inmem",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					stateDelta: { k: "v2" },
					artifactDelta: { note: 1 },
				}),
			}),
		);

		await runner.rewind({
			userId: "u1",
			sessionId: "s-rewind",
			rewindBeforeInvocationId: "inv2",
		});

		const updated = await runner.sessionService.getSession(
			"rewind-app",
			"u1",
			"s-rewind",
		);
		expect(updated?.state.k).toBe("v1");
		const note = await runner.artifactService?.loadArtifact({
			appName: "rewind-app",
			userId: "u1",
			sessionId: "s-rewind",
			filename: "note",
		});
		expect(note).toEqual({ text: "v0" });
	});

	it("skips persisting partial agent events into memory", async () => {
		const agent = new LlmAgent({
			name: "partial_inmem",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent, { appName: "partial-app" });
		const memorySpy = vi.spyOn(
			runner.memoryService as InMemoryMemoryService,
			"addSessionToMemory",
		);
		const session = await runner.sessionService.createSession(
			"partial-app",
			"u1",
			{},
			"s-partial",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "partial_inmem",
				partial: true,
				content: { role: "model", parts: [{ text: "stream" }] },
			});
			yield new Event({
				author: "partial_inmem",
				content: { role: "model", parts: [{ text: "done" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: session.id,
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(2);
		expect(memorySpy).toHaveBeenCalledTimes(1);
		const updated = await runner.sessionService.getSession(
			"partial-app",
			"u1",
			"s-partial",
		);
		expect(
			updated?.events.filter((e) => e.author === "partial_inmem"),
		).toHaveLength(1);
	});

	it("routes function responses to a transferable sub-agent under InMemoryRunner", async () => {
		const child = new LlmAgent({
			name: "tool_child",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_inmem",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		const runner = new InMemoryRunner(root, { appName: "fr-app" });
		const session = await runner.sessionService.createSession(
			"fr-app",
			"u1",
			{},
			"s-fr",
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				author: "tool_child",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "call_inmem",
								name: "lookup",
								args: {},
							},
						},
					],
				},
			}),
		);

		const childSpy = vi
			.spyOn(child, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "tool_child",
					content: { role: "model", parts: [{ text: "from-child" }] },
				});
			});
		vi.spyOn(root, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_inmem",
				content: { role: "model", parts: [{ text: "from-root" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: session.id,
			newMessage: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "call_inmem",
							name: "lookup",
							response: { ok: true },
						},
					},
				],
			},
		})) {
			events.push(event);
		}

		expect(childSpy).toHaveBeenCalled();
		expect(events[0].author).toBe("tool_child");
	});

	it("runs two sequential turns on the same in-memory session", async () => {
		const agent = new LlmAgent({
			name: "multi_turn",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent, { appName: "multi-app" });
		const session = await runner.sessionService.createSession(
			"multi-app",
			"u1",
			{},
			"s-multi",
		);
		let turn = 0;
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			turn += 1;
			yield new Event({
				author: "multi_turn",
				content: { role: "model", parts: [{ text: `turn-${turn}` }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: session.id,
			newMessage: { role: "user", parts: [{ text: "first" }] },
		})) {
			// drain
		}
		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: session.id,
			newMessage: { role: "user", parts: [{ text: "second" }] },
		})) {
			// drain
		}

		const updated = await runner.sessionService.getSession(
			"multi-app",
			"u1",
			"s-multi",
		);
		const agentTexts = updated?.events
			.filter((e) => e.author === "multi_turn")
			.map((e) => e.content?.parts?.[0]?.text);
		expect(agentTexts).toEqual(["turn-1", "turn-2"]);
		expect(updated?.events.filter((e) => e.author === "user")).toHaveLength(2);
	});

	it("does not replace text parts when saveInputBlobsAsArtifacts is enabled without blobs", async () => {
		const agent = new LlmAgent({
			name: "text_only",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent, { appName: "text-app" });
		const saveSpy = vi.spyOn(
			runner.artifactService as InMemoryArtifactService,
			"saveArtifact",
		);
		const session = await runner.sessionService.createSession(
			"text-app",
			"u1",
			{},
			"s-text",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "text_only",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: session.id,
			newMessage: { role: "user", parts: [{ text: "plain" }] },
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: true }),
		})) {
			// drain
		}

		expect(saveSpy).not.toHaveBeenCalled();
		const updated = await runner.sessionService.getSession(
			"text-app",
			"u1",
			"s-text",
		);
		expect(
			updated?.events.find((e) => e.author === "user")?.content?.parts?.[0]
				?.text,
		).toBe("plain");
	});
});
