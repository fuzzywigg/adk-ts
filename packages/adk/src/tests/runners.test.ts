import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import type { EventsSummarizer } from "../events/events-summarizer";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import { BasePlugin } from "../plugins/base-plugin";
import {
	_findFunctionCallEventIfLastEventIsFunctionResponse,
	InMemoryRunner,
	Runner,
} from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

const createMockSession = (events: (Event | null)[] | null): Session =>
	({
		id: `s-${Math.random()}`,
		userId: `u-${Math.random()}`,
		events,
	}) as Session;

const createFunctionCallEvent = (
	calls: { id: string; name: string }[],
): Event => {
	const event = new Event({ author: "agent" });
	vi.spyOn(event, "getFunctionCalls").mockReturnValue(
		calls.map((call) => ({ ...call, args: {} })),
	);
	return event;
};

const createFunctionResponseEvent = (response: {
	id: string;
	name: string;
}): Event => {
	return new Event({
		author: "tool",
		content: {
			parts: [
				{
					functionResponse: { ...response, response: { result: "ok" } },
				},
			],
		},
	});
};

describe("_findFunctionCallEventIfLastEventIsFunctionResponse", () => {
	it("should return null if session has no events", () => {
		const sessionWithNullEvents = createMockSession(null);
		const sessionWithEmptyEvents = createMockSession([]);

		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(
				sessionWithNullEvents,
			),
		).toBeNull();
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(
				sessionWithEmptyEvents,
			),
		).toBeNull();
	});

	it("should return null if the last event is not a function response", () => {
		const session = createMockSession([
			new Event({ author: "agent4", content: { parts: [{ text: "hello" }] } }),
		]);
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(session),
		).toBeNull();
	});

	it("should return null if the function response has no ID", () => {
		const responseEvent = new Event({
			author: "agent4",
			content: {
				parts: [{ functionResponse: { name: "tool1", response: {} } }],
			},
		});
		const session = createMockSession([responseEvent]);
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(session),
		).toBeNull();
	});

	it("should return null if no matching function call is found", () => {
		const callEvent = createFunctionCallEvent([
			{ id: "call_other", name: "other_tool" },
		]);
		const responseEvent = createFunctionResponseEvent({
			id: "call_123",
			name: "tool1",
		});
		const session = createMockSession([callEvent, responseEvent]);
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(session),
		).toBeNull();
	});

	it("should return the event with the matching function call", () => {
		const functionCallEvent = createFunctionCallEvent([
			{ id: "call_abc", name: "tool1" },
		]);
		const responseEvent = createFunctionResponseEvent({
			id: "call_abc",
			name: "tool1",
		});
		const session = createMockSession([functionCallEvent, responseEvent]);
		const result = _findFunctionCallEventIfLastEventIsFunctionResponse(session);
		expect(result).toBe(functionCallEvent);
	});

	it("should find the matching call even if it's not the immediately preceding event", () => {
		const functionCallEvent = createFunctionCallEvent([
			{ id: "call_def", name: "tool2" },
		]);
		const intermediateEvent = new Event({
			author: "agent4",
			content: { parts: [{ text: "intermediate" }] },
		});
		vi.spyOn(intermediateEvent, "getFunctionCalls").mockReturnValue([]);
		const responseEvent = createFunctionResponseEvent({
			id: "call_def",
			name: "tool2",
		});
		const session = createMockSession([
			functionCallEvent,
			intermediateEvent,
			responseEvent,
		]);
		const result = _findFunctionCallEventIfLastEventIsFunctionResponse(session);
		expect(result).toBe(functionCallEvent);
	});

	it("should find the correct event when it contains multiple function calls", () => {
		const functionCallEvent = createFunctionCallEvent([
			{ id: "call_A", name: "toolA" },
			{ id: "call_B", name: "toolB" },
			{ id: "call_C", name: "toolC" },
		]);
		const responseEvent = createFunctionResponseEvent({
			id: "call_B",
			name: "toolB",
		});
		const session = createMockSession([functionCallEvent, responseEvent]);
		const result = _findFunctionCallEventIfLastEventIsFunctionResponse(session);
		expect(result).toBe(functionCallEvent);
	});
});

describe("Runner.runAsync", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;
	let runner: Runner;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			description: "stub",
		});
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			memoryService: new InMemoryMemoryService(),
		});
	});

	it("throws when the session does not exist", async () => {
		const gen = runner.runAsync({
			userId: "u1",
			sessionId: "missing",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		});
		await expect(gen.next()).rejects.toThrow(/Session not found: missing/);
	});

	it("runs the root agent and appends non-partial events", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s1");
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

		const session = await sessionService.getSession("runner-app", "u1", "s1");
		expect(session?.events.some((e) => e.author === "user")).toBe(true);
		expect(session?.events.some((e) => e.author === "root_agent")).toBe(true);
	});

	it("skips persisting partial agent events", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s2");
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
		const session = await sessionService.getSession("runner-app", "u1", "s2");
		expect(
			session?.events.filter((e) => e.author === "root_agent"),
		).toHaveLength(1);
		expect(
			session?.events.find((e) => e.author === "root_agent")?.content
				?.parts?.[0]?.text,
		).toBe("done");
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
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
		});

		const session = await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			"s3",
		);
		await sessionService.appendEvent(
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
		await sessionService.createSession("runner-app", "u1", {}, "s4");
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			eventsCompactionConfig: {
				compactionInterval: 10,
				overlapSize: 1,
			},
		});
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

	it("close delegates to the plugin manager", async () => {
		const closeSpy = vi
			.spyOn(runner.pluginManager, "close")
			.mockResolvedValue(undefined);
		await runner.close();
		expect(closeSpy).toHaveBeenCalledTimes(1);
	});

	it("throws when newMessage has no parts", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-parts");
		const gen = runner.runAsync({
			userId: "u1",
			sessionId: "s-parts",
			newMessage: { role: "user", parts: undefined as any },
		});
		await expect(gen.next()).rejects.toThrow(/No parts in the new_message/);
	});

	it("persists agent events into memory when memoryService is set", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-mem");
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

	it("short-circuits via beforeRunCallback and skips the agent", async () => {
		class EarlyExitPlugin extends BasePlugin {
			async beforeRunCallback() {
				return new Event({
					author: "plugin",
					content: { role: "model", parts: [{ text: "early" }] },
				});
			}
		}

		await sessionService.createSession("runner-app", "u1", {}, "s-early");
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new EarlyExitPlugin("early")],
		});
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
		expect(events[0].content?.parts?.[0]?.text).toBe("early");
		const session = await sessionService.getSession(
			"runner-app",
			"u1",
			"s-early",
		);
		expect(session?.events.some((e) => e.author === "plugin")).toBe(true);
	});

	it("applies onEventCallback modifications before yielding", async () => {
		class MutateEventPlugin extends BasePlugin {
			async onEventCallback({ event }: { event: Event }) {
				return new Event({
					author: event.author,
					content: { role: "model", parts: [{ text: "mutated" }] },
				});
			}
		}

		await sessionService.createSession("runner-app", "u1", {}, "s-on-event");
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new MutateEventPlugin("mutate")],
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "original" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-on-event",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events[0].content?.parts?.[0]?.text).toBe("mutated");
	});

	it("applies onUserMessageCallback before appending the user event", async () => {
		class MutateUserPlugin extends BasePlugin {
			async onUserMessageCallback() {
				return {
					role: "user" as const,
					parts: [{ text: "rewritten-user" }],
				};
			}
		}

		await sessionService.createSession("runner-app", "u1", {}, "s-user-msg");
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new MutateUserPlugin("user-msg")],
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-user-msg",
			newMessage: { role: "user", parts: [{ text: "original-user" }] },
		})) {
			// drain
		}

		const session = await sessionService.getSession(
			"runner-app",
			"u1",
			"s-user-msg",
		);
		const userEvent = session?.events.find((e) => e.author === "user");
		expect(userEvent?.content?.parts?.[0]?.text).toBe("rewritten-user");
	});

	it("saves inlineData blobs as artifacts when configured", async () => {
		const artifactService = new InMemoryArtifactService();
		await sessionService.createSession("runner-app", "u1", {}, "s-blob");
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			artifactService,
		});
		const saveSpy = vi.spyOn(artifactService, "saveArtifact");
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
		const session = await sessionService.getSession(
			"runner-app",
			"u1",
			"s-blob",
		);
		const userEvent = session?.events.find((e) => e.author === "user");
		const parts = userEvent?.content?.parts ?? [];
		expect(parts[0]?.text).toBe("see file");
		expect(parts[1]?.text).toMatch(/^Uploaded file: artifact_/);
		expect(parts[1]?.inlineData).toBeUndefined();
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
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
		});

		const session = await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			"s-fr-route",
		);
		await sessionService.appendEvent(
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
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
		});

		const session = await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			"s-locked",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "locked_child",
				content: { role: "model", parts: [{ text: "prior" }] },
			}),
		);

		const childSpy = vi
			.spyOn(child, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "locked_child",
					content: { role: "model", parts: [{ text: "from-child" }] },
				});
			});
		const rootSpy = vi
			.spyOn(agent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "from-root" }] },
				});
			});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-locked",
			newMessage: { role: "user", parts: [{ text: "continue" }] },
		})) {
			events.push(event);
		}

		expect(childSpy).not.toHaveBeenCalled();
		expect(rootSpy).toHaveBeenCalled();
		expect(events[0].author).toBe("root_agent");
	});

	it("skips unknown prior authors and falls back to root", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-unknown");
		const session = await sessionService.getSession(
			"runner-app",
			"u1",
			"s-unknown",
		);
		await sessionService.appendEvent(
			session!,
			new Event({
				author: "ghost_agent",
				content: { role: "model", parts: [{ text: "who?" }] },
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
		expect(events[0].author).toBe("root_agent");
	});

	it("runs compaction when a summarizer is configured", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-compact");
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
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			eventsCompactionConfig: {
				compactionInterval: 1,
				overlapSize: 0,
				summarizer,
			},
		});
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
		await sessionService.createSession("runner-app", "u1", {}, "s-compact-err");
		const summarizer: EventsSummarizer = {
			maybeSummarizeEvents: vi
				.fn()
				.mockRejectedValue(new Error("compaction boom")),
		};
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			eventsCompactionConfig: {
				compactionInterval: 1,
				overlapSize: 0,
				summarizer,
			},
		});
		const errorSpy = vi
			.spyOn(runner["logger"], "error")
			.mockImplementation(() => {});
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
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events[0].content?.parts?.[0]?.text).toBe("still-ok");
		expect(errorSpy).toHaveBeenCalled();
	});

	it("invokes afterRunCallback after the agent finishes", async () => {
		const afterRun = vi.fn().mockResolvedValue(undefined);
		class AfterPlugin extends BasePlugin {
			async afterRunCallback() {
				return afterRun();
			}
		}

		await sessionService.createSession("runner-app", "u1", {}, "s-after");
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new AfterPlugin("after")],
		});
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
});

describe("InMemoryRunner", () => {
	it("wires in-memory services and accepts plugins", async () => {
		class NoopPlugin extends BasePlugin {}
		const agent = new LlmAgent({
			name: "mem_root",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent, {
			appName: "custom-inmem",
			plugins: [new NoopPlugin("noop")],
		});

		expect(runner.appName).toBe("custom-inmem");
		expect(runner.sessionService).toBeInstanceOf(InMemorySessionService);
		expect(runner.artifactService).toBeInstanceOf(InMemoryArtifactService);
		expect(runner.memoryService).toBeInstanceOf(InMemoryMemoryService);
		expect(runner.pluginManager).toBeTruthy();

		const session = await runner.sessionService.createSession(
			"custom-inmem",
			"u1",
			{},
			"s1",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "mem_root",
				content: { role: "model", parts: [{ text: "hi" }] },
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
	});
});
