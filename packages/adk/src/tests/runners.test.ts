import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import {
	_findFunctionCallEventIfLastEventIsFunctionResponse,
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
});
