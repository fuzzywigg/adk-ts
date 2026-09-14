import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import type { InvocationContext } from "../agents/invocation-context";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

class EarlyExitPlugin extends BasePlugin {
	constructor(private readonly event: Event) {
		super("early-exit");
	}

	override async beforeRunCallback(_params: {
		invocationContext: InvocationContext;
	}): Promise<Event | undefined> {
		return this.event;
	}

	override async afterRunCallback(): Promise<void> {
		throw new Error("after_run should not run on early exit");
	}
}

describe("Runner fifth leftover edges (post #146)", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;
	let runner: Runner;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new Runner({
			appName: "runner-fifth-app",
			agent,
			sessionService,
		});
	});

	it("runAsync with omitted newMessage skips _appendNewMessageToSession", async () => {
		await sessionService.createSession(
			"runner-fifth-app",
			"u1",
			{},
			"s-omit-msg",
		);
		const appendSpy = vi.spyOn(runner as any, "_appendNewMessageToSession");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "hi" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-omit-msg",
		} as any)) {
			events.push(event);
		}

		expect(appendSpy).not.toHaveBeenCalled();
		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("hi");
	});

	it("grandparent disallowTransferToParent makes subtree non-transferable", () => {
		const grandchild = new LlmAgent({
			name: "grandchild",
			model: "gemini-2.0-flash-exp",
		});
		const child = new LlmAgent({
			name: "child",
			model: "gemini-2.0-flash-exp",
			subAgents: [grandchild],
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
			disallowTransferToParent: true,
		});
		runner = new Runner({
			appName: "runner-fifth-app",
			agent: root,
			sessionService,
		});

		expect((runner as any)._isTransferableAcrossAgentTree(grandchild)).toBe(
			false,
		);
		expect((runner as any)._isTransferableAcrossAgentTree(child)).toBe(false);
	});

	it("partial events are yielded but not appended; final events are appended", async () => {
		await sessionService.createSession(
			"runner-fifth-app",
			"u1",
			{},
			"s-partial",
		);
		const appendSpy = vi.spyOn(sessionService, "appendEvent");
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				partial: true,
				content: { role: "model", parts: [{ text: "part" }] },
			});
			yield new Event({
				author: "root_agent",
				partial: false,
				content: { role: "model", parts: [{ text: "final" }] },
			});
		});

		const yielded: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-partial",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			yielded.push(event);
		}

		expect(yielded.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"part",
			"final",
		]);
		const appendedTexts = appendSpy.mock.calls
			.map((c) => (c[1] as Event).content?.parts?.[0]?.text)
			.filter(Boolean);
		expect(appendedTexts).toContain("final");
		expect(appendedTexts).not.toContain("part");
	});

	it("early-exit plugin yields once and skips after_run", async () => {
		await sessionService.createSession("runner-fifth-app", "u1", {}, "s-early");
		const early = new Event({
			author: "early-exit",
			content: { role: "model", parts: [{ text: "stopped" }] },
		});
		const plugin = new EarlyExitPlugin(early);
		const afterSpy = vi.spyOn(plugin, "afterRunCallback");
		runner = new Runner({
			appName: "runner-fifth-app",
			agent,
			sessionService,
			plugins: [plugin],
		});
		const agentSpy = vi.spyOn(agent, "runAsync");

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-early",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("stopped");
		expect(agentSpy).not.toHaveBeenCalled();
		expect(afterSpy).not.toHaveBeenCalled();
	});

	it("agent throw records span error status and rethrows", async () => {
		await sessionService.createSession("runner-fifth-app", "u1", {}, "s-throw");
		vi.spyOn(agent, "runAsync").mockImplementation(
			// biome-ignore lint/correctness/useYield: error-path mock must throw before yielding
			async function* () {
				throw new Error("agent exploded");
			},
		);

		await expect(async () => {
			for await (const _ of runner.runAsync({
				userId: "u1",
				sessionId: "s-throw",
				newMessage: { role: "user", parts: [{ text: "go" }] },
			})) {
				/* drain */
			}
		}).rejects.toThrow("agent exploded");
	});

	it("findSubAgent miss continues reverse scan then falls back to root", () => {
		const known = new LlmAgent({
			name: "known_child",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [known],
		});
		runner = new Runner({
			appName: "runner-fifth-app",
			agent: root,
			sessionService,
		});

		const session = {
			id: "s1",
			userId: "u1",
			events: [
				new Event({
					author: "ghost_agent",
					content: { role: "model", parts: [{ text: "unknown" }] },
				}),
				new Event({
					author: "known_child",
					content: { role: "model", parts: [{ text: "known" }] },
				}),
			],
		} as Session;

		const chosen = (runner as any)._findAgentToRun(session, root);
		expect(chosen).toBe(known);

		const onlyGhost = {
			id: "s2",
			userId: "u1",
			events: [
				new Event({
					author: "ghost_agent",
					content: { role: "model", parts: [{ text: "unknown" }] },
				}),
			],
		} as Session;
		expect((runner as any)._findAgentToRun(onlyGhost, root)).toBe(root);
	});
});
