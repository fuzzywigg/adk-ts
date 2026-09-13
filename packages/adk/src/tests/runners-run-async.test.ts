import { describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../agents/base-agent";
import { Event } from "../events/event";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class StubAgent extends BaseAgent {
	runAsync = vi.fn(async function* () {
		yield new Event({
			author: "stub",
			content: { role: "model", parts: [{ text: "hello" }] },
		});
	});

	constructor() {
		super({ name: "stub", description: "stub agent" });
	}
}

class EarlyExitPlugin extends BasePlugin {
	constructor() {
		super("early-exit");
	}

	async beforeRunCallback() {
		return new Event({
			author: "early-exit",
			content: { role: "model", parts: [{ text: "short circuit" }] },
		});
	}
}

class CloseTrackingPlugin extends BasePlugin {
	closed = false;

	constructor() {
		super("close-tracker");
	}

	async close() {
		this.closed = true;
	}
}

describe("Runner.runAsync edges", () => {
	it("throws when the session is missing", async () => {
		const runner = new Runner({
			appName: "app",
			agent: new StubAgent(),
			sessionService: new InMemorySessionService(),
		});

		const gen = runner.runAsync({
			userId: "u1",
			sessionId: "missing",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		});

		await expect(gen.next()).rejects.toThrow(/Session not found: missing/);
	});

	it("throws when newMessage has no parts", async () => {
		const sessionService = new InMemorySessionService();
		const runner = new Runner({
			appName: "app",
			agent: new StubAgent(),
			sessionService,
		});
		await sessionService.createSession("app", "u1", {}, "s1");

		const gen = runner.runAsync({
			userId: "u1",
			sessionId: "s1",
			newMessage: { role: "user" } as any,
		});

		await expect(gen.next()).rejects.toThrow(/No parts in the new_message/);
	});

	it("early-exits when beforeRunCallback returns an event", async () => {
		const sessionService = new InMemorySessionService();
		const agent = new StubAgent();
		const runner = new Runner({
			appName: "app",
			agent,
			sessionService,
			plugins: [new EarlyExitPlugin()],
		});
		await sessionService.createSession("app", "u1", {}, "s1");

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s1",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0].author).toBe("early-exit");
		expect(agent.runAsync).not.toHaveBeenCalled();
	});

	it("adds non-partial events to memory when memoryService is set", async () => {
		const sessionService = new InMemorySessionService();
		const memoryService = new InMemoryMemoryService();
		const addSpy = vi.spyOn(memoryService, "addSessionToMemory");
		const runner = new Runner({
			appName: "app",
			agent: new StubAgent(),
			sessionService,
			memoryService,
		});
		await sessionService.createSession("app", "u1", {}, "s1");

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s1",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
		}

		expect(addSpy).toHaveBeenCalled();
	});

	it("delegates close to the plugin manager", async () => {
		const plugin = new CloseTrackingPlugin();
		const runner = new Runner({
			appName: "app",
			agent: new StubAgent(),
			sessionService: new InMemorySessionService(),
			plugins: [plugin],
		});

		await runner.close();
		expect(plugin.closed).toBe(true);
	});
});
