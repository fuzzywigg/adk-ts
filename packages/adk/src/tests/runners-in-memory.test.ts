import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import type { EventsSummarizer } from "../events/events-summarizer";
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

	it("accepts plugins and exposes a plugin manager", () => {
		class MarkerPlugin extends BasePlugin {}
		const agent = new LlmAgent({ name: "plugin_agent" });
		const runner = new InMemoryRunner(agent, {
			appName: "plugin-app",
			plugins: [new MarkerPlugin("marker")],
		});
		expect(runner.pluginManager).toBeTruthy();
	});
});

describe("InMemoryRunner.runAsync", () => {
	let agent: LlmAgent;
	let runner: InMemoryRunner;

	beforeEach(() => {
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			description: "stub",
		});
		runner = new InMemoryRunner(agent, { appName: "inmem-app" });
	});

	it("throws when the session does not exist", async () => {
		const gen = runner.runAsync({
			userId: "u1",
			sessionId: "missing",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		});
		await expect(gen.next()).rejects.toThrow(/Session not found: missing/);
	});

	it("throws when newMessage has no parts", async () => {
		await runner.sessionService.createSession("inmem-app", "u1", {}, "s-parts");
		const gen = runner.runAsync({
			userId: "u1",
			sessionId: "s-parts",
			newMessage: { role: "user", parts: undefined as any },
		});
		await expect(gen.next()).rejects.toThrow(/No parts in the new_message/);
	});

	it("runs the root agent and appends non-partial events", async () => {
		await runner.sessionService.createSession("inmem-app", "u1", {}, "s1");
		const agentEvent = new Event({
			author: "root_agent",
			content: { role: "model", parts: [{ text: "hello" }] },
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield agentEvent;
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s1",
			newMessage: { role: "user", parts: [{ text: "ping" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("hello");

		const session = await runner.sessionService.getSession(
			"inmem-app",
			"u1",
			"s1",
		);
		expect(session?.events.some((e) => e.author === "user")).toBe(true);
		expect(session?.events.some((e) => e.author === "root_agent")).toBe(true);
	});

	it("skips persisting partial agent events", async () => {
		await runner.sessionService.createSession("inmem-app", "u1", {}, "s2");
		const partial = new Event({
			author: "root_agent",
			partial: true,
			content: { role: "model", parts: [{ text: "stream" }] },
		});
		const final = new Event({
			author: "root_agent",
			content: { role: "model", parts: [{ text: "done" }] },
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield partial;
			yield final;
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s2",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(2);
		const session = await runner.sessionService.getSession(
			"inmem-app",
			"u1",
			"s2",
		);
		expect(
			session?.events.filter((e) => e.author === "root_agent"),
		).toHaveLength(1);
		expect(
			session?.events.find((e) => e.author === "root_agent")?.content
				?.parts?.[0]?.text,
		).toBe("done");
	});

	it("always has memoryService and persists agent events into memory", async () => {
		await runner.sessionService.createSession("inmem-app", "u1", {}, "s-mem");
		expect(runner.memoryService).toBeInstanceOf(InMemoryMemoryService);
		const memorySpy = vi.spyOn(
			runner.memoryService as InMemoryMemoryService,
			"addSessionToMemory",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "mem" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-mem",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			// drain
		}

		expect(memorySpy).toHaveBeenCalled();
	});

	it("always has artifactService and saves inlineData blobs when configured", async () => {
		await runner.sessionService.createSession("inmem-app", "u1", {}, "s-blob");
		expect(runner.artifactService).toBeInstanceOf(InMemoryArtifactService);
		const saveSpy = vi.spyOn(
			runner.artifactService as InMemoryArtifactService,
			"saveArtifact",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "got-it" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-blob",
			newMessage: {
				role: "user",
				parts: [
					{ text: "see file" },
					{
						inlineData: {
							mimeType: "text/plain",
							data: "aGVsbG8=",
						},
					},
				],
			},
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: true }),
		})) {
			// drain
		}

		expect(saveSpy).toHaveBeenCalledTimes(1);
		const session = await runner.sessionService.getSession(
			"inmem-app",
			"u1",
			"s-blob",
		);
		const userEvent = session?.events.find((e) => e.author === "user");
		const parts = userEvent?.content?.parts ?? [];
		expect(parts[0]?.text).toBe("see file");
		expect(parts[1]?.text).toMatch(/^Uploaded file: artifact_/);
		expect(parts[1]?.inlineData).toBeUndefined();
	});

	it("does not save blobs when saveInputBlobsAsArtifacts is false", async () => {
		await runner.sessionService.createSession(
			"inmem-app",
			"u1",
			{},
			"s-noblob",
		);
		const saveSpy = vi.spyOn(
			runner.artifactService as InMemoryArtifactService,
			"saveArtifact",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-noblob",
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
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: false }),
		})) {
			// drain
		}

		expect(saveSpy).not.toHaveBeenCalled();
	});

	it("short-circuits via beforeRunCallback and skips the agent", async () => {
		class EarlyExitPlugin extends BasePlugin {
			async beforeRunCallback() {
				return new Event({
					author: "plugin",
					content: { role: "model", parts: [{ text: "early" }] },
				});
			}
		}

		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new InMemoryRunner(agent, {
			appName: "inmem-app",
			plugins: [new EarlyExitPlugin("early")],
		});
		await runner.sessionService.createSession("inmem-app", "u1", {}, "s-early");
		const agentSpy = vi
			.spyOn(agent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "should-not-run" }] },
				});
			});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-early",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(agentSpy).not.toHaveBeenCalled();
		expect(events).toHaveLength(1);
		expect(events[0].author).toBe("plugin");
		expect(events[0].content?.parts?.[0]?.text).toBe("early");
	});

	it("applies onUserMessageCallback before appending the user event", async () => {
		class RewriteUserPlugin extends BasePlugin {
			async onUserMessageCallback() {
				return {
					role: "user" as const,
					parts: [{ text: "rewritten" }],
				};
			}
		}

		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new InMemoryRunner(agent, {
			appName: "inmem-app",
			plugins: [new RewriteUserPlugin("rewrite")],
		});
		await runner.sessionService.createSession(
			"inmem-app",
			"u1",
			{},
			"s-rewrite",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ack" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-rewrite",
			newMessage: { role: "user", parts: [{ text: "original" }] },
		})) {
			// drain
		}

		const session = await runner.sessionService.getSession(
			"inmem-app",
			"u1",
			"s-rewrite",
		);
		const userEvent = session?.events.find((e) => e.author === "user");
		expect(userEvent?.content?.parts?.[0]?.text).toBe("rewritten");
	});

	it("applies onEventCallback modifications before yielding", async () => {
		class TagEventPlugin extends BasePlugin {
			async onEventCallback({ event }: { event: Event }) {
				return new Event({
					author: event.author,
					content: {
						role: "model",
						parts: [{ text: `tagged:${event.content?.parts?.[0]?.text}` }],
					},
				});
			}
		}

		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new InMemoryRunner(agent, {
			appName: "inmem-app",
			plugins: [new TagEventPlugin("tag")],
		});
		await runner.sessionService.createSession("inmem-app", "u1", {}, "s-tag");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "raw" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-tag",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events[0].content?.parts?.[0]?.text).toBe("tagged:raw");
	});

	it("invokes afterRunCallback after the agent finishes", async () => {
		const afterRun = vi.fn().mockResolvedValue(undefined);
		class AfterPlugin extends BasePlugin {
			async afterRunCallback() {
				return afterRun();
			}
		}

		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new InMemoryRunner(agent, {
			appName: "inmem-app",
			plugins: [new AfterPlugin("after")],
		});
		await runner.sessionService.createSession("inmem-app", "u1", {}, "s-after");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "done" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-after",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			// drain
		}

		expect(afterRun).toHaveBeenCalledTimes(1);
	});

	it("close delegates to the plugin manager", async () => {
		const closeSpy = vi
			.spyOn(runner.pluginManager, "close")
			.mockResolvedValue(undefined);
		await runner.close();
		expect(closeSpy).toHaveBeenCalledTimes(1);
	});

	it("routes to a transferable sub-agent based on prior non-user events", async () => {
		const child = new LlmAgent({
			name: "child_agent",
			model: "gemini-2.0-flash-exp",
		});
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		runner = new InMemoryRunner(agent, { appName: "inmem-app" });

		const session = await runner.sessionService.createSession(
			"inmem-app",
			"u1",
			{},
			"s3",
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				author: "child_agent",
				content: { role: "model", parts: [{ text: "prior" }] },
				actions: new EventActions({ transferToAgent: "child_agent" }),
			}),
		);

		const childSpy = vi
			.spyOn(child, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "child_agent",
					content: { role: "model", parts: [{ text: "from-child" }] },
				});
			});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "from-root" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s3",
			newMessage: { role: "user", parts: [{ text: "continue" }] },
		})) {
			events.push(event);
		}

		expect(childSpy).toHaveBeenCalled();
		expect(events[0].author).toBe("child_agent");
	});

	it("falls back to root when compaction config has no summarizer", async () => {
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new InMemoryRunner(agent, { appName: "inmem-app" });
		(runner as any).eventsCompactionConfig = {
			compactionInterval: 10,
			overlapSize: 1,
		};
		await runner.sessionService.createSession("inmem-app", "u1", {}, "s4");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s4",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
			runConfig: new RunConfig(),
		})) {
			events.push(event);
		}
		expect(events).toHaveLength(1);
	});

	it("runs compaction when a summarizer is configured", async () => {
		const summarizer: EventsSummarizer = {
			maybeSummarizeEvents: vi.fn().mockResolvedValue(
				new Event({
					invocationId: "compaction-inv",
					author: "user",
					actions: new EventActions({
						compaction: {
							startTimestamp: 1,
							endTimestamp: 2,
							compactedContent: {
								role: "model",
								parts: [{ text: "summary" }],
							},
						},
					}),
				}),
			),
		};

		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new InMemoryRunner(agent, { appName: "inmem-app" });
		(runner as any).eventsCompactionConfig = {
			compactionInterval: 1,
			overlapSize: 0,
			summarizer,
		};

		await runner.sessionService.createSession(
			"inmem-app",
			"u1",
			{},
			"s-compact",
		);

		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-compact",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			// drain
		}

		expect(summarizer.maybeSummarizeEvents).toHaveBeenCalled();
	});

	it("swallows compaction errors and still yields agent events", async () => {
		const summarizer: EventsSummarizer = {
			maybeSummarizeEvents: vi
				.fn()
				.mockRejectedValue(new Error("compact fail")),
		};

		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new InMemoryRunner(agent, { appName: "inmem-app" });
		(runner as any).eventsCompactionConfig = {
			compactionInterval: 1,
			overlapSize: 0,
			summarizer,
		};
		const errorSpy = vi
			.spyOn((runner as any).logger, "error")
			.mockImplementation(() => {});

		await runner.sessionService.createSession(
			"inmem-app",
			"u1",
			{},
			"s-compact-err",
		);

		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "still-ok" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-compact-err",
			newMessage: { role: "user", parts: [{ text: "next" }] },
		})) {
			events.push(event);
		}

		expect(events.some((e) => e.content?.parts?.[0]?.text === "still-ok")).toBe(
			true,
		);
		expect(errorSpy).toHaveBeenCalled();
	});

	it("routes function responses to the agent that authored the matching call", async () => {
		const child = new LlmAgent({
			name: "tool_agent",
			model: "gemini-2.0-flash-exp",
		});
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		runner = new InMemoryRunner(agent, { appName: "inmem-app" });

		const session = await runner.sessionService.createSession(
			"inmem-app",
			"u1",
			{},
			"s-fr-route",
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				author: "tool_agent",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "call_fr_1",
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
					author: "tool_agent",
					content: { role: "model", parts: [{ text: "from-tool-agent" }] },
				});
			});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "from-root" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-fr-route",
			newMessage: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "call_fr_1",
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
		expect(events[0].author).toBe("tool_agent");
	});

	it("supports multiple sequential turns on the same in-memory session", async () => {
		await runner.sessionService.createSession("inmem-app", "u1", {}, "s-multi");
		vi.spyOn(agent, "runAsync")
			.mockImplementationOnce(async function* () {
				yield new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "turn-1" }] },
				});
			})
			.mockImplementationOnce(async function* () {
				yield new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "turn-2" }] },
				});
			});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-multi",
			newMessage: { role: "user", parts: [{ text: "first" }] },
		})) {
			// drain
		}
		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-multi",
			newMessage: { role: "user", parts: [{ text: "second" }] },
		})) {
			// drain
		}

		const session = await runner.sessionService.getSession(
			"inmem-app",
			"u1",
			"s-multi",
		);
		const userTexts = session?.events
			.filter((e) => e.author === "user")
			.map((e) => e.content?.parts?.[0]?.text);
		const agentTexts = session?.events
			.filter((e) => e.author === "root_agent")
			.map((e) => e.content?.parts?.[0]?.text);
		expect(userTexts).toEqual(["first", "second"]);
		expect(agentTexts).toEqual(["turn-1", "turn-2"]);
	});

	it("isolates sessions across different userIds in the same runner", async () => {
		await runner.sessionService.createSession("inmem-app", "alice", {}, "s-a");
		await runner.sessionService.createSession("inmem-app", "bob", {}, "s-b");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "alice",
			sessionId: "s-a",
			newMessage: { role: "user", parts: [{ text: "from-alice" }] },
		})) {
			// drain
		}
		for await (const _ of runner.runAsync({
			userId: "bob",
			sessionId: "s-b",
			newMessage: { role: "user", parts: [{ text: "from-bob" }] },
		})) {
			// drain
		}

		const alice = await runner.sessionService.getSession(
			"inmem-app",
			"alice",
			"s-a",
		);
		const bob = await runner.sessionService.getSession(
			"inmem-app",
			"bob",
			"s-b",
		);
		expect(
			alice?.events.some((e) => e.content?.parts?.[0]?.text === "from-alice"),
		).toBe(true);
		expect(
			bob?.events.some((e) => e.content?.parts?.[0]?.text === "from-bob"),
		).toBe(true);
		expect(
			alice?.events.some((e) => e.content?.parts?.[0]?.text === "from-bob"),
		).toBe(false);
	});

	it("falls back to root when prior agent disallows transfer to parent", async () => {
		const child = new LlmAgent({
			name: "locked_child",
			model: "gemini-2.0-flash-exp",
			disallowTransferToParent: true,
		});
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		runner = new InMemoryRunner(agent, { appName: "inmem-app" });

		const session = await runner.sessionService.createSession(
			"inmem-app",
			"u1",
			{},
			"s-locked",
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				author: "locked_child",
				content: { role: "model", parts: [{ text: "prior" }] },
			}),
		);

		const rootSpy = vi
			.spyOn(agent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "from-root" }] },
				});
			});
		vi.spyOn(child, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "locked_child",
				content: { role: "model", parts: [{ text: "from-child" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-locked",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(rootSpy).toHaveBeenCalled();
		expect(events[0].author).toBe("root_agent");
	});

	it("skips unknown prior authors and falls back to root", async () => {
		await runner.sessionService.createSession(
			"inmem-app",
			"u1",
			{},
			"s-unknown",
		);
		const session = await runner.sessionService.getSession(
			"inmem-app",
			"u1",
			"s-unknown",
		);
		await runner.sessionService.appendEvent(
			session!,
			new Event({
				author: "ghost_agent",
				content: { role: "model", parts: [{ text: "prior" }] },
			}),
		);

		const rootSpy = vi
			.spyOn(agent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "root-ok" }] },
				});
			});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-unknown",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(rootSpy).toHaveBeenCalled();
		expect(events[0].content?.parts?.[0]?.text).toBe("root-ok");
	});

	it("yields nothing when the agent produces no events", async () => {
		await runner.sessionService.createSession("inmem-app", "u1", {}, "s-empty");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			// no yields
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-empty",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(0);
		const session = await runner.sessionService.getSession(
			"inmem-app",
			"u1",
			"s-empty",
		);
		expect(session?.events.some((e) => e.author === "user")).toBe(true);
		expect(session?.events.some((e) => e.author === "root_agent")).toBe(false);
	});

	it("lists saved artifacts from the built-in artifact service after a blob upload", async () => {
		await runner.sessionService.createSession(
			"inmem-app",
			"u1",
			{},
			"s-list-art",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ack" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-list-art",
			newMessage: {
				role: "user",
				parts: [
					{
						inlineData: {
							mimeType: "text/plain",
							data: "aGVsbG8=",
						},
					},
				],
			},
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: true }),
		})) {
			// drain
		}

		const keys = await runner.artifactService!.listArtifactKeys({
			appName: "inmem-app",
			userId: "u1",
			sessionId: "s-list-art",
		});
		expect(keys.length).toBeGreaterThan(0);
	});

	it("searches memory after a turn via the built-in memory service", async () => {
		await runner.sessionService.createSession(
			"inmem-app",
			"u1",
			{},
			"s-search-mem",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "remember Paris weather" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-search-mem",
			newMessage: {
				role: "user",
				parts: [{ text: "Paris weather is sunny" }],
			},
		})) {
			// drain
		}

		const result = await runner.memoryService!.searchMemory({
			appName: "inmem-app",
			userId: "u1",
			query: "Paris",
		});
		expect(result.memories.length).toBeGreaterThan(0);
	});
});
