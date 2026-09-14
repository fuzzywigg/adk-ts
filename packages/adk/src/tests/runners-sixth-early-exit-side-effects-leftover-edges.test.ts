import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import type { InvocationContext } from "../agents/invocation-context";
import { Event } from "../events/event";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class EarlyExitPlugin extends BasePlugin {
	constructor(private readonly event: Event) {
		super("early-exit-sixth");
	}

	override async beforeRunCallback(_params: {
		invocationContext: InvocationContext;
	}): Promise<Event | undefined> {
		return this.event;
	}

	override async onEventCallback(): Promise<Event | undefined> {
		throw new Error("on_event should not run on early exit");
	}

	override async afterRunCallback(): Promise<void> {
		throw new Error("after_run should not run on early exit");
	}
}

describe("Runner sixth leftover: early-exit side effects (post #151)", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
	});

	it("early-exit appends twice (plugin path + outer !partial loop)", async () => {
		await sessionService.createSession(
			"runner-sixth-app",
			"u1",
			{},
			"s-double-append",
		);
		const early = new Event({
			author: "early-exit-sixth",
			content: { role: "model", parts: [{ text: "stopped" }] },
		});
		const runner = new Runner({
			appName: "runner-sixth-app",
			agent,
			sessionService,
			plugins: [new EarlyExitPlugin(early)],
		});
		const appendSpy = vi.spyOn(sessionService, "appendEvent");

		const yielded: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-double-append",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			yielded.push(event);
		}

		expect(yielded).toHaveLength(1);
		expect(yielded[0].content?.parts?.[0]?.text).toBe("stopped");

		const earlyAppends = appendSpy.mock.calls.filter(
			(c) => (c[1] as Event).author === "early-exit-sixth",
		);
		expect(earlyAppends).toHaveLength(2);
	});

	it("early-exit still calls memoryService.addSessionToMemory for the yielded event", async () => {
		await sessionService.createSession(
			"runner-sixth-app",
			"u1",
			{},
			"s-early-mem",
		);
		const memoryService = new InMemoryMemoryService();
		const addSpy = vi.spyOn(memoryService, "addSessionToMemory");
		const early = new Event({
			author: "early-exit-sixth",
			content: { role: "model", parts: [{ text: "mem-stop" }] },
		});
		const runner = new Runner({
			appName: "runner-sixth-app",
			agent,
			sessionService,
			memoryService,
			plugins: [new EarlyExitPlugin(early)],
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-early-mem",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			/* drain */
		}

		expect(addSpy).toHaveBeenCalledTimes(1);
	});

	it("early-exit still invokes _runCompaction after the generator ends", async () => {
		await sessionService.createSession(
			"runner-sixth-app",
			"u1",
			{},
			"s-early-compact",
		);
		const early = new Event({
			author: "early-exit-sixth",
			content: { role: "model", parts: [{ text: "compact-stop" }] },
		});
		const summarizer = {
			maybeSummarizeEvents: vi.fn(async () => undefined),
		};
		const runner = new Runner({
			appName: "runner-sixth-app",
			agent,
			sessionService,
			plugins: [new EarlyExitPlugin(early)],
			eventsCompactionConfig: {
				compactionInterval: 1,
				overlapSize: 0,
				summarizer: summarizer as any,
			},
		});
		const compactSpy = vi.spyOn(runner as any, "_runCompaction");

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-early-compact",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			/* drain */
		}

		expect(compactSpy).toHaveBeenCalledTimes(1);
	});

	it("early-exit skips onEventCallback and never runs the agent", async () => {
		await sessionService.createSession(
			"runner-sixth-app",
			"u1",
			{},
			"s-early-on-event",
		);
		const early = new Event({
			author: "early-exit-sixth",
			content: { role: "model", parts: [{ text: "no-on-event" }] },
		});
		const plugin = new EarlyExitPlugin(early);
		const onEventSpy = vi.spyOn(plugin, "onEventCallback");
		const runner = new Runner({
			appName: "runner-sixth-app",
			agent,
			sessionService,
			plugins: [plugin],
		});
		const agentSpy = vi.spyOn(agent, "runAsync");

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-early-on-event",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			/* drain */
		}

		expect(onEventSpy).not.toHaveBeenCalled();
		expect(agentSpy).not.toHaveBeenCalled();
	});
});
