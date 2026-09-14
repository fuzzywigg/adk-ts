import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../agents/base-agent";
import type { InvocationContext } from "../agents/invocation-context";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import * as compactionModule from "../events/compaction";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import type { EventsSummarizer } from "../events/events-summarizer";
import { LlmEventSummarizer } from "../events/llm-event-summarizer";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import { BaseLlm } from "../models/base-llm";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
import { BasePlugin } from "../plugins/base-plugin";
import {
	_findFunctionCallEventIfLastEventIsFunctionResponse,
	InMemoryRunner,
	Runner,
} from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

class StubLlm extends BaseLlm {
	async *generateContentAsync(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		yield {
			content: { role: "model", parts: [{ text: "stub" }] },
		} as LlmResponse;
	}
}

class StubBaseAgent extends BaseAgent {
	protected async *runAsyncImpl(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: this.name,
			content: { role: "model", parts: [{ text: `from-${this.name}` }] },
		});
	}
}

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

	it("treats missing getFunctionCalls as an empty list", () => {
		const callEvent = new Event({
			author: "agent",
			content: { role: "model", parts: [{ text: "no-calls-api" }] },
		});
		(callEvent as { getFunctionCalls?: unknown }).getFunctionCalls = undefined;
		const responseEvent = createFunctionResponseEvent({
			id: "call_missing_api",
			name: "tool1",
		});
		const session = createMockSession([callEvent, responseEvent]);
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(session),
		).toBeNull();
	});

	it("returns null when last event has empty parts", () => {
		const session = createMockSession([
			new Event({ author: "agent", content: { parts: [] } }),
		]);
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(session),
		).toBeNull();
	});

	it("returns null when last event has no content", () => {
		const session = createMockSession([new Event({ author: "agent" })]);
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(session),
		).toBeNull();
	});

	it("uses the first functionResponse id when multiple responses are present", () => {
		const functionCallEvent = createFunctionCallEvent([
			{ id: "call_first", name: "toolA" },
			{ id: "call_second", name: "toolB" },
		]);
		const responseEvent = new Event({
			author: "tool",
			content: {
				parts: [
					{
						functionResponse: {
							id: "call_first",
							name: "toolA",
							response: { ok: 1 },
						},
					},
					{
						functionResponse: {
							id: "call_second",
							name: "toolB",
							response: { ok: 2 },
						},
					},
				],
			},
		});
		const session = createMockSession([functionCallEvent, responseEvent]);
		expect(_findFunctionCallEventIfLastEventIsFunctionResponse(session)).toBe(
			functionCallEvent,
		);
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

	it("falls back to root when an ancestor disallows transfer to parent", async () => {
		const leaf = new LlmAgent({
			name: "leaf_agent",
			model: "gemini-2.0-flash-exp",
		});
		const mid = new LlmAgent({
			name: "mid_agent",
			model: "gemini-2.0-flash-exp",
			disallowTransferToParent: true,
			subAgents: [leaf],
		});
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [mid],
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
			"s-ancestor-lock",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "leaf_agent",
				content: { role: "model", parts: [{ text: "prior" }] },
			}),
		);

		const leafSpy = vi
			.spyOn(leaf, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "leaf_agent",
					content: { role: "model", parts: [{ text: "from-leaf" }] },
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
			sessionId: "s-ancestor-lock",
			newMessage: { role: "user", parts: [{ text: "continue" }] },
		})) {
			events.push(event);
		}

		expect(leafSpy).not.toHaveBeenCalled();
		expect(rootSpy).toHaveBeenCalled();
		expect(events[0].author).toBe("root_agent");
	});

	it("sync run drains runAsync events after the async side completes", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-sync-run");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "sync-ok" }] },
			});
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-sync-run",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(async () => {
			const session = await sessionService.getSession(
				"runner-app",
				"u1",
				"s-sync-run",
			);
			expect(
				session?.events.some(
					(e) =>
						e.author === "root_agent" &&
						e.content?.parts?.[0]?.text === "sync-ok",
				),
			).toBe(true);
		});

		const events = [...generator];
		expect(events).toHaveLength(1);
		expect(events[0].author).toBe("root_agent");
		expect(events[0].content?.parts?.[0]?.text).toBe("sync-ok");
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

	it("keeps the original event when onEventCallback returns undefined", async () => {
		class NoopEventPlugin extends BasePlugin {
			async onEventCallback() {
				return undefined;
			}
		}

		await sessionService.createSession("runner-app", "u1", {}, "s-noop-event");
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new NoopEventPlugin("noop-event")],
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
			sessionId: "s-noop-event",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events[0].content?.parts?.[0]?.text).toBe("original");
	});

	it("skips afterRunCallback when beforeRunCallback short-circuits", async () => {
		const afterRun = vi.fn().mockResolvedValue(undefined);
		class EarlyExitNoAfterPlugin extends BasePlugin {
			async beforeRunCallback() {
				return new Event({
					author: "plugin",
					content: { role: "model", parts: [{ text: "early" }] },
				});
			}
			async afterRunCallback() {
				return afterRun();
			}
		}

		await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			"s-early-no-after",
		);
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new EarlyExitNoAfterPlugin("early-no-after")],
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "should-not-run" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-early-no-after",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			// drain
		}

		expect(afterRun).not.toHaveBeenCalled();
	});

	it("completes when the agent yields zero events", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-empty");
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
		const session = await sessionService.getSession(
			"runner-app",
			"u1",
			"s-empty",
		);
		expect(session?.events.some((e) => e.author === "user")).toBe(true);
		expect(session?.events.some((e) => e.author === "root_agent")).toBe(false);
	});

	it("preserves agent event order across multiple yields", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-order");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "one" }] },
			});
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "two" }] },
			});
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "three" }] },
			});
		});

		const texts: string[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-order",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			texts.push(event.content?.parts?.[0]?.text ?? "");
		}

		expect(texts).toEqual(["one", "two", "three"]);
	});

	it("propagates agent errors from runAsync", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-agent-err");
		const debugSpy = vi
			.spyOn(runner["logger"], "debug")
			.mockImplementation(() => {});
		vi.spyOn(agent, "runAsync").mockImplementation(
			// biome-ignore lint/correctness/useYield: error-path mock must throw before yielding
			async function* () {
				throw new Error("agent boom");
			},
		);

		const gen = runner.runAsync({
			userId: "u1",
			sessionId: "s-agent-err",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		});
		await expect(gen.next()).rejects.toThrow(/agent boom/);
		expect(debugSpy).toHaveBeenCalled();
	});

	it("does not call memoryService when it is omitted", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-no-mem");
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
		});
		expect(runner.memoryService).toBeUndefined();
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-no-mem",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			// drain
		}

		const session = await sessionService.getSession(
			"runner-app",
			"u1",
			"s-no-mem",
		);
		expect(session?.events.some((e) => e.author === "root_agent")).toBe(true);
	});

	it("skips artifact saving when artifactService is missing", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-no-art");
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-no-art",
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

		const session = await sessionService.getSession(
			"runner-app",
			"u1",
			"s-no-art",
		);
		const userEvent = session?.events.find((e) => e.author === "user");
		expect(userEvent?.content?.parts?.[0]?.inlineData?.data).toBe("aGVsbG8=");
	});

	it("does not save artifacts when message has only text parts", async () => {
		const artifactService = new InMemoryArtifactService();
		await sessionService.createSession("runner-app", "u1", {}, "s-text-only");
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
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-text-only",
			newMessage: {
				role: "user",
				parts: [{ text: "just text" }],
			},
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: true }),
		})) {
			// drain
		}

		expect(saveSpy).not.toHaveBeenCalled();
	});

	it("saves multiple inlineData blobs as separate artifacts", async () => {
		const artifactService = new InMemoryArtifactService();
		await sessionService.createSession("runner-app", "u1", {}, "s-multi-blob");
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
				content: { role: "model", parts: [{ text: "got" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-multi-blob",
			newMessage: {
				role: "user",
				parts: [
					{
						inlineData: {
							mimeType: "text/plain",
							data: "YQ==",
						},
					},
					{ text: "middle" },
					{
						inlineData: {
							mimeType: "image/png",
							data: "Yg==",
						},
					},
				],
			},
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: true }),
		})) {
			// drain
		}

		expect(saveSpy).toHaveBeenCalledTimes(2);
		const session = await sessionService.getSession(
			"runner-app",
			"u1",
			"s-multi-blob",
		);
		const parts = session?.events.find((e) => e.author === "user")?.content
			?.parts;
		expect(parts?.[0]?.text).toMatch(/^Uploaded file: artifact_/);
		expect(parts?.[1]?.text).toBe("middle");
		expect(parts?.[2]?.text).toMatch(/^Uploaded file: artifact_/);
	});

	it("routes to root when the prior non-user author is the root agent", async () => {
		const session = await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			"s-root-prior",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "prior-root" }] },
			}),
		);

		const rootSpy = vi
			.spyOn(agent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "again" }] },
				});
			});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-root-prior",
			newMessage: { role: "user", parts: [{ text: "continue" }] },
		})) {
			events.push(event);
		}

		expect(rootSpy).toHaveBeenCalled();
		expect(events[0].author).toBe("root_agent");
	});

	it("falls back to root when prior author is a non-LlmAgent sub-agent", async () => {
		const nonLlmChild = new StubBaseAgent({
			name: "shell_child",
			description: "non-llm",
		});
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [nonLlmChild],
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
			"s-non-llm",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "shell_child",
				content: { role: "model", parts: [{ text: "prior" }] },
			}),
		);

		const childSpy = vi
			.spyOn(nonLlmChild, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "shell_child",
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
			sessionId: "s-non-llm",
			newMessage: { role: "user", parts: [{ text: "continue" }] },
		})) {
			events.push(event);
		}

		expect(childSpy).not.toHaveBeenCalled();
		expect(rootSpy).toHaveBeenCalled();
		expect(events[0].author).toBe("root_agent");
	});

	it("warns when compaction is configured but canonicalModel throws", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-canon-throw");
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			eventsCompactionConfig: {
				compactionInterval: 1,
				overlapSize: 0,
			},
		});
		vi.spyOn(agent, "canonicalModel", "get").mockImplementation(() => {
			throw new Error("no canonical model");
		});
		const warnSpy = vi
			.spyOn(runner["logger"], "warn")
			.mockImplementation(() => {});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-canon-throw",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			// drain
		}

		expect(warnSpy).toHaveBeenCalledWith(
			"Could not get canonical model for default summarizer:",
			expect.any(Error),
		);
		expect(warnSpy).toHaveBeenCalledWith(
			"Event compaction configured but no summarizer available",
		);
	});

	it("warns when compaction is configured on a non-LlmAgent root", async () => {
		const stubRoot = new StubBaseAgent({
			name: "shell_root",
			description: "non-llm root",
		});
		await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			"s-non-llm-root",
		);
		runner = new Runner({
			appName: "runner-app",
			agent: stubRoot,
			sessionService,
			eventsCompactionConfig: {
				compactionInterval: 1,
				overlapSize: 0,
			},
		});
		const warnSpy = vi
			.spyOn(runner["logger"], "warn")
			.mockImplementation(() => {});
		vi.spyOn(stubRoot, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "shell_root",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-non-llm-root",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			// drain
		}

		expect(warnSpy).toHaveBeenCalledWith(
			"Event compaction configured but no summarizer available",
		);
	});

	it("auto-creates an LlmEventSummarizer when compaction has no summarizer", async () => {
		const fakeModel = new StubLlm("stub-model");
		agent = new LlmAgent({
			name: "root_agent",
			model: fakeModel,
		});
		await sessionService.createSession("runner-app", "u1", {}, "s-auto-sum");
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			eventsCompactionConfig: {
				compactionInterval: 1,
				overlapSize: 0,
			},
		});
		const summarizeSpy = vi
			.spyOn(LlmEventSummarizer.prototype, "maybeSummarizeEvents")
			.mockResolvedValue(
				new Event({
					invocationId: "auto-compaction",
					author: "user",
					actions: new EventActions({
						compaction: {
							startTimestamp: 1,
							endTimestamp: 2,
							compactedContent: {
								role: "model",
								parts: [{ text: "auto-summary" }],
							},
						},
					}),
				}),
			);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-auto-sum",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			// drain
		}

		expect(summarizeSpy).toHaveBeenCalled();
		summarizeSpy.mockRestore();
	});

	it("does not run compaction when eventsCompactionConfig is absent", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-no-compact");
		const compactSpy = vi
			.spyOn(compactionModule, "runCompactionForSlidingWindow")
			.mockResolvedValue(undefined);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-no-compact",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			// drain
		}

		expect(compactSpy).not.toHaveBeenCalled();
		compactSpy.mockRestore();
	});

	it("forwards pluginCloseTimeout to the plugin manager", async () => {
		class SlowClosePlugin extends BasePlugin {
			async close(): Promise<void> {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new SlowClosePlugin("slow")],
			pluginCloseTimeout: 1,
		});

		await expect(runner.close()).rejects.toThrow(/close\(\) timeout/);
	});

	it("sync run accepts an omitted runConfig and still drains events", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-sync-rc");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "sync-default-rc" }] },
			});
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-sync-rc",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(async () => {
			const session = await sessionService.getSession(
				"runner-app",
				"u1",
				"s-sync-rc",
			);
			expect(
				session?.events.some(
					(e) =>
						e.author === "root_agent" &&
						e.content?.parts?.[0]?.text === "sync-default-rc",
				),
			).toBe(true);
		});

		const events = [...generator];
		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("sync-default-rc");
	});

	it("sync run forwards an explicit RunConfig into runAsync", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-sync-cfg");
		const runConfig = new RunConfig({ saveInputBlobsAsArtifacts: false });
		vi.spyOn(agent, "runAsync").mockImplementation(async function* (ctx) {
			expect(ctx.runConfig).toBe(runConfig);
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "cfg-ok" }] },
			});
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-sync-cfg",
			newMessage: { role: "user", parts: [{ text: "go" }] },
			runConfig,
		});

		await vi.waitFor(async () => {
			const session = await sessionService.getSession(
				"runner-app",
				"u1",
				"s-sync-cfg",
			);
			expect(
				session?.events.some(
					(e) =>
						e.author === "root_agent" &&
						e.content?.parts?.[0]?.text === "cfg-ok",
				),
			).toBe(true);
		});

		const events = [...generator];
		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("cfg-ok");
	});

	it("sync run drains multiple events in order", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-sync-multi");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "a" }] },
			});
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "b" }] },
			});
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "c" }] },
			});
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-sync-multi",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(async () => {
			const session = await sessionService.getSession(
				"runner-app",
				"u1",
				"s-sync-multi",
			);
			expect(
				session?.events.filter((e) => e.author === "root_agent"),
			).toHaveLength(3);
		});

		const texts = [...generator].map((e) => e.content?.parts?.[0]?.text);
		expect(texts).toEqual(["a", "b", "c"]);
	});

	it("sync run completes with an empty event list when the agent yields nothing", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-sync-empty");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			// no yields
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-sync-empty",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(async () => {
			const session = await sessionService.getSession(
				"runner-app",
				"u1",
				"s-sync-empty",
			);
			expect(session?.events.some((e) => e.author === "user")).toBe(true);
		});

		expect([...generator]).toEqual([]);
	});

	it("sync run yields only non-null events when the agent streams partial then final", async () => {
		await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			"s-sync-partial",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				partial: true,
				content: { role: "model", parts: [{ text: "chunk" }] },
			});
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "final" }] },
			});
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-sync-partial",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(async () => {
			const session = await sessionService.getSession(
				"runner-app",
				"u1",
				"s-sync-partial",
			);
			expect(
				session?.events.some(
					(e) =>
						e.author === "root_agent" &&
						e.content?.parts?.[0]?.text === "final",
				),
			).toBe(true);
		});

		const events = [...generator];
		expect(events).toHaveLength(2);
		expect(events[0].partial).toBe(true);
		expect(events[1].content?.parts?.[0]?.text).toBe("final");
	});

	it("skips unknown authors then routes to an earlier transferable sub-agent", async () => {
		const child = new LlmAgent({
			name: "known_child",
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
			"s-skip-unknown",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "known_child",
				content: { role: "model", parts: [{ text: "older" }] },
			}),
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "ghost_agent",
				content: { role: "model", parts: [{ text: "newer-unknown" }] },
			}),
		);

		const childSpy = vi
			.spyOn(child, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "known_child",
					content: { role: "model", parts: [{ text: "from-known" }] },
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
			sessionId: "s-skip-unknown",
			newMessage: { role: "user", parts: [{ text: "continue" }] },
		})) {
			events.push(event);
		}

		expect(childSpy).toHaveBeenCalled();
		expect(events[0].author).toBe("known_child");
	});

	it("falls back to root when the session only has user events", async () => {
		const session = await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			"s-only-user",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "prior-user" }] },
			}),
		);

		const rootSpy = vi
			.spyOn(agent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "root-only" }] },
				});
			});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-only-user",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(rootSpy).toHaveBeenCalled();
		expect(events[0].author).toBe("root_agent");
	});

	it("prefers function-response routing over a later transferable sub-agent", async () => {
		const toolAgent = new LlmAgent({
			name: "tool_agent",
			model: "gemini-2.0-flash-exp",
		});
		const chatAgent = new LlmAgent({
			name: "chat_agent",
			model: "gemini-2.0-flash-exp",
		});
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [toolAgent, chatAgent],
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
			"s-fr-prefers",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "chat_agent",
				content: { role: "model", parts: [{ text: "chat-prior" }] },
			}),
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
								id: "call_pref",
								name: "lookup",
								args: {},
							},
						},
					],
				},
			}),
		);

		const toolSpy = vi
			.spyOn(toolAgent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "tool_agent",
					content: { role: "model", parts: [{ text: "from-tool" }] },
				});
			});
		const chatSpy = vi
			.spyOn(chatAgent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "chat_agent",
					content: { role: "model", parts: [{ text: "from-chat" }] },
				});
			});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-fr-prefers",
			newMessage: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "call_pref",
							name: "lookup",
							response: { ok: true },
						},
					},
				],
			},
		})) {
			events.push(event);
		}

		expect(toolSpy).toHaveBeenCalled();
		expect(chatSpy).not.toHaveBeenCalled();
		expect(events[0].author).toBe("tool_agent");
	});

	it("skips a locked sub-agent and continues searching for a transferable one", async () => {
		const locked = new LlmAgent({
			name: "locked_leaf",
			model: "gemini-2.0-flash-exp",
			disallowTransferToParent: true,
		});
		const open = new LlmAgent({
			name: "open_leaf",
			model: "gemini-2.0-flash-exp",
		});
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [locked, open],
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
			"s-skip-locked",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "open_leaf",
				content: { role: "model", parts: [{ text: "older-open" }] },
			}),
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "locked_leaf",
				content: { role: "model", parts: [{ text: "newer-locked" }] },
			}),
		);

		const openSpy = vi
			.spyOn(open, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "open_leaf",
					content: { role: "model", parts: [{ text: "from-open" }] },
				});
			});
		const lockedSpy = vi
			.spyOn(locked, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "locked_leaf",
					content: { role: "model", parts: [{ text: "from-locked" }] },
				});
			});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-skip-locked",
			newMessage: { role: "user", parts: [{ text: "continue" }] },
		})) {
			events.push(event);
		}

		expect(lockedSpy).not.toHaveBeenCalled();
		expect(openSpy).toHaveBeenCalled();
		expect(events[0].author).toBe("open_leaf");
	});

	it("does not save inline blobs when saveInputBlobsAsArtifacts is false", async () => {
		const artifactService = new InMemoryArtifactService();
		await sessionService.createSession("runner-app", "u1", {}, "s-blob-off");
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
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-blob-off",
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
		const session = await sessionService.getSession(
			"runner-app",
			"u1",
			"s-blob-off",
		);
		expect(
			session?.events.find((e) => e.author === "user")?.content?.parts?.[0]
				?.inlineData?.data,
		).toBe("YQ==");
	});

	it("keeps the original user message when onUserMessageCallback returns undefined", async () => {
		class NoopUserPlugin extends BasePlugin {
			async onUserMessageCallback() {
				return undefined;
			}
		}

		await sessionService.createSession("runner-app", "u1", {}, "s-user-noop");
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new NoopUserPlugin("user-noop")],
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-user-noop",
			newMessage: { role: "user", parts: [{ text: "keep-me" }] },
		})) {
			// drain
		}

		const session = await sessionService.getSession(
			"runner-app",
			"u1",
			"s-user-noop",
		);
		expect(
			session?.events.find((e) => e.author === "user")?.content?.parts?.[0]
				?.text,
		).toBe("keep-me");
	});

	it("defaults runConfig when the caller omits it", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-default-rc");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* (ctx) {
			expect(ctx.runConfig).toBeInstanceOf(RunConfig);
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "defaulted" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-default-rc",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events[0].content?.parts?.[0]?.text).toBe("defaulted");
	});

	it("yields partial events without calling memoryService for them", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-partial-mem");
		const memorySpy = vi.spyOn(
			runner.memoryService as InMemoryMemoryService,
			"addSessionToMemory",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				partial: true,
				content: { role: "model", parts: [{ text: "chunk" }] },
			});
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "final" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-partial-mem",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(2);
		expect(memorySpy).toHaveBeenCalledTimes(1);
	});

	it("logs a debug message when skipping an unknown prior agent author", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-unknown-log");
		const session = await sessionService.getSession(
			"runner-app",
			"u1",
			"s-unknown-log",
		);
		const ghost = new Event({
			author: "ghost_agent",
			content: { role: "model", parts: [{ text: "who?" }] },
		});
		await sessionService.appendEvent(session!, ghost);

		const debugSpy = vi
			.spyOn(runner["logger"], "debug")
			.mockImplementation(() => {});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "root-ok" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-unknown-log",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			// drain
		}

		expect(debugSpy).toHaveBeenCalledWith(
			`Event from an unknown agent: ghost_agent, event id: ${ghost.id}`,
		);
	});

	it("propagates non-Error throws from runAsync with a generic span message", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-string-err");
		const debugSpy = vi
			.spyOn(runner["logger"], "debug")
			.mockImplementation(() => {});
		vi.spyOn(agent, "runAsync").mockImplementation(
			// biome-ignore lint/correctness/useYield: error-path mock must throw before yielding
			async function* () {
				throw "string-boom";
			},
		);

		const gen = runner.runAsync({
			userId: "u1",
			sessionId: "s-string-err",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		});
		await expect(gen.next()).rejects.toBe("string-boom");
		expect(debugSpy).toHaveBeenCalled();
	});

	it("continues with findAgent(author) when the last session event is a function response", () => {
		const child = new LlmAgent({
			name: "fr_author_agent",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		const localRunner = new Runner({
			appName: "runner-app",
			agent: root,
			sessionService,
		});

		const callEvent = new Event({
			author: "fr_author_agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "call_direct_fr",
							name: "lookup",
							args: {},
						},
					},
				],
			},
		});
		const responseEvent = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "call_direct_fr",
							name: "lookup",
							response: { ok: true },
						},
					},
				],
			},
		});
		const session = {
			id: "s-fr-find-agent",
			appName: "runner-app",
			userId: "u1",
			state: {},
			events: [callEvent, responseEvent],
			lastUpdateTime: 0,
		} as Session;

		const findSpy = vi.spyOn(root, "findAgent");
		const chosen = (localRunner as any)._findAgentToRun(session, root);

		expect(findSpy).toHaveBeenCalledWith("fr_author_agent");
		expect(chosen).toBe(child);
	});

	it("sets userContent to null when newMessage is omitted from the invocation context", () => {
		const session = {
			id: "s-omit-msg",
			appName: "runner-app",
			userId: "u1",
			state: {},
			events: [],
			lastUpdateTime: 0,
		} as Session;

		const ctx = (runner as any)._newInvocationContext(session, {
			runConfig: new RunConfig(),
		});
		expect(ctx.userContent).toBeNull();
	});

	it("runs with omitted newMessage and leaves userContent null on the agent context", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-omit-run");
		let seenUserContent: unknown = "unset";
		vi.spyOn(agent, "runAsync").mockImplementation(async function* (ctx) {
			seenUserContent = ctx.userContent;
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "no-user-msg" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-omit-run",
			newMessage: undefined as any,
		})) {
			events.push(event);
		}

		expect(seenUserContent).toBeNull();
		expect(events[0].content?.parts?.[0]?.text).toBe("no-user-msg");
	});
});

describe("_findFunctionCallEventIfLastEventIsFunctionResponse leftovers", () => {
	it("matches a functionResponse mixed with preceding text parts", () => {
		const functionCallEvent = createFunctionCallEvent([
			{ id: "call_mixed", name: "tool1" },
		]);
		const responseEvent = new Event({
			author: "tool",
			content: {
				parts: [
					{ text: "tool result follows" },
					{
						functionResponse: {
							id: "call_mixed",
							name: "tool1",
							response: { ok: true },
						},
					},
				],
			},
		});
		const session = createMockSession([functionCallEvent, responseEvent]);
		expect(_findFunctionCallEventIfLastEventIsFunctionResponse(session)).toBe(
			functionCallEvent,
		);
	});

	it("walks past earlier non-matching call events to find the match", () => {
		const olderMatch = createFunctionCallEvent([
			{ id: "call_walk", name: "tool1" },
		]);
		const newerMiss = createFunctionCallEvent([
			{ id: "call_other", name: "other" },
		]);
		const responseEvent = createFunctionResponseEvent({
			id: "call_walk",
			name: "tool1",
		});
		const session = createMockSession([olderMatch, newerMiss, responseEvent]);
		expect(_findFunctionCallEventIfLastEventIsFunctionResponse(session)).toBe(
			olderMatch,
		);
	});

	it("returns null when the only preceding event has no matching call id", () => {
		const alone = createFunctionCallEvent([{ id: "call_x", name: "x" }]);
		const responseEvent = createFunctionResponseEvent({
			id: "call_y",
			name: "y",
		});
		const session = createMockSession([alone, responseEvent]);
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(session),
		).toBeNull();
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

	it("constructs with default options when the options object is omitted", () => {
		const agent = new LlmAgent({
			name: "default_opts_agent",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent);
		expect(runner.appName).toBe("InMemoryRunner");
		expect(runner.sessionService).toBeInstanceOf(InMemorySessionService);
		expect(runner.artifactService).toBeInstanceOf(InMemoryArtifactService);
		expect(runner.memoryService).toBeInstanceOf(InMemoryMemoryService);
	});

	it("persists agent output into the wired in-memory memory service", async () => {
		const agent = new LlmAgent({
			name: "mem_persist",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new InMemoryRunner(agent, { appName: "persist-app" });
		const memorySpy = vi.spyOn(
			runner.memoryService as InMemoryMemoryService,
			"addSessionToMemory",
		);
		const session = await runner.sessionService.createSession(
			"persist-app",
			"u1",
			{},
			"s-persist",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "mem_persist",
				content: { role: "model", parts: [{ text: "stored" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: session.id,
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			// drain
		}

		expect(memorySpy).toHaveBeenCalled();
	});
});
