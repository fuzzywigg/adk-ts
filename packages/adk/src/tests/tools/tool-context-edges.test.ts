import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { EventActions } from "../../events/event-actions";
import { State } from "../../sessions/state";
import { ToolContext } from "../../tools/tool-context";

function makeInvocation(
	overrides: Partial<InvocationContext> = {},
): InvocationContext {
	return {
		appName: "tool-app",
		userId: "tool-user",
		invocationId: "inv-tool",
		agent: { name: "tool_agent" },
		userContent: { role: "user", parts: [{ text: "hi" }] },
		session: { id: "sess-tool", state: { seed: 1 } },
		artifactService: undefined,
		memoryService: undefined,
		...overrides,
	} as InvocationContext;
}

describe("ToolContext leftover edges", () => {
	describe("state helpers via CallbackContext", () => {
		it("exposes delta-aware state backed by session state", () => {
			const context = new ToolContext(makeInvocation());
			expect(context.state).toBeInstanceOf(State);
			expect(context.state.get("seed")).toBe(1);
			expect(context.state.hasDelta()).toBe(false);
		});

		it("writes through state into eventActions.stateDelta", () => {
			const actions = new EventActions();
			const context = new ToolContext(makeInvocation(), {
				eventActions: actions,
			});
			context.state.counter = 2;
			context.state.set("flag", true);
			expect(actions.stateDelta).toEqual({ counter: 2, flag: true });
			expect(context.state.hasDelta()).toBe(true);
			expect(context.state.toDict()).toMatchObject({
				seed: 1,
				counter: 2,
				flag: true,
			});
		});

		it("shares the same EventActions via actions and eventActions", () => {
			const actions = new EventActions({ escalate: true });
			const context = new ToolContext(makeInvocation(), {
				eventActions: actions,
			});
			expect(context.actions).toBe(actions);
			expect(context.eventActions).toBe(actions);
			context.actions.transferToAgent = "other";
			expect(context.eventActions.transferToAgent).toBe("other");
		});

		it("prefixes app/user/temp keys through ToolContext.state", () => {
			const context = new ToolContext(makeInvocation());
			context.state[`${State.APP_PREFIX}theme`] = "dark";
			context.state[`${State.USER_PREFIX}locale`] = "en";
			context.state[`${State.TEMP_PREFIX}draft`] = { n: 1 };
			expect(context.eventActions.stateDelta).toEqual({
				[`${State.APP_PREFIX}theme`]: "dark",
				[`${State.USER_PREFIX}locale`]: "en",
				[`${State.TEMP_PREFIX}draft`]: { n: 1 },
			});
		});
	});

	describe("readonly identity helpers", () => {
		it.each([
			["invocationId", "inv-tool"],
			["agentName", "tool_agent"],
			["appName", "tool-app"],
			["userId", "tool-user"],
			["sessionId", "sess-tool"],
		] as const)("exposes %s as %s", (getter, expected) => {
			const context = new ToolContext(makeInvocation());
			expect(context[getter]).toBe(expected);
		});

		it("exposes userContent from the invocation context", () => {
			const context = new ToolContext(makeInvocation());
			expect(context.userContent).toEqual({
				role: "user",
				parts: [{ text: "hi" }],
			});
		});

		it("invocationContext getter returns the same instance", () => {
			const invocation = makeInvocation();
			const context = new ToolContext(invocation);
			expect(context.invocationContext).toBe(invocation);
		});
	});

	describe("artifact helpers", () => {
		it("loadArtifact forwards optional version", async () => {
			const loadArtifact = vi.fn().mockResolvedValue({ text: "v2" });
			const context = new ToolContext(
				makeInvocation({
					artifactService: { loadArtifact } as any,
				}),
			);
			await expect(context.loadArtifact("f.txt", 2)).resolves.toEqual({
				text: "v2",
			});
			expect(loadArtifact).toHaveBeenCalledWith({
				appName: "tool-app",
				userId: "tool-user",
				sessionId: "sess-tool",
				filename: "f.txt",
				version: 2,
			});
		});

		it("loadArtifact omits version when undefined", async () => {
			const loadArtifact = vi.fn().mockResolvedValue(undefined);
			const context = new ToolContext(
				makeInvocation({
					artifactService: { loadArtifact } as any,
				}),
			);
			await expect(
				context.loadArtifact("missing.bin"),
			).resolves.toBeUndefined();
			expect(loadArtifact).toHaveBeenCalledWith({
				appName: "tool-app",
				userId: "tool-user",
				sessionId: "sess-tool",
				filename: "missing.bin",
				version: undefined,
			});
		});

		it("saveArtifact records version into artifactDelta and overwrites keys", async () => {
			const saveArtifact = vi
				.fn()
				.mockResolvedValueOnce(1)
				.mockResolvedValueOnce(4);
			const context = new ToolContext(
				makeInvocation({
					artifactService: { saveArtifact } as any,
				}),
			);
			await expect(
				context.saveArtifact("a.txt", { text: "one" } as any),
			).resolves.toBe(1);
			await expect(
				context.saveArtifact("a.txt", { text: "two" } as any),
			).resolves.toBe(4);
			expect(context.eventActions.artifactDelta).toEqual({ "a.txt": 4 });
		});

		it("listArtifacts uses session.id even when state is empty", async () => {
			const listArtifactKeys = vi.fn().mockResolvedValue(["only.txt"]);
			const context = new ToolContext(
				makeInvocation({
					session: { id: "empty-state-sess", state: {} } as any,
					artifactService: { listArtifactKeys } as any,
				}),
			);
			await expect(context.listArtifacts()).resolves.toEqual(["only.txt"]);
			expect(listArtifactKeys).toHaveBeenCalledWith({
				appName: "tool-app",
				userId: "tool-user",
				sessionId: "empty-state-sess",
			});
		});
	});

	describe("memory and functionCallId leftovers", () => {
		it.each([
			"q",
			"",
			" spaced ",
			"unicode-μ",
		])("forwards searchMemory query %#: %j", async (query) => {
			const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
			const context = new ToolContext(
				makeInvocation({
					memoryService: { searchMemory } as any,
				}),
			);
			await context.searchMemory(query);
			expect(searchMemory).toHaveBeenCalledWith({
				query,
				appName: "tool-app",
				userId: "tool-user",
			});
		});

		it("constructs with functionCallId and leaves actions defaulted", () => {
			const context = new ToolContext(makeInvocation(), {
				functionCallId: "fc-edge",
			});
			expect(context.functionCallId).toBe("fc-edge");
			expect(context.actions).toBeInstanceOf(EventActions);
			expect(context.actions.escalate).toBeUndefined();
		});

		it("allows clearing functionCallId after construction", () => {
			const context = new ToolContext(makeInvocation(), {
				functionCallId: "fc",
			});
			context.functionCallId = undefined;
			expect(context.functionCallId).toBeUndefined();
		});

		it("throws distinct errors for missing artifact vs memory services", async () => {
			const context = new ToolContext(makeInvocation());
			await expect(context.listArtifacts()).rejects.toThrow(
				"Artifact service is not initialized.",
			);
			await expect(context.searchMemory("x")).rejects.toThrow(
				"Memory service is not available.",
			);
			await expect(context.loadArtifact("x")).rejects.toThrow(
				"Artifact service is not initialized.",
			);
			await expect(
				context.saveArtifact("x", { text: "y" } as any),
			).rejects.toThrow("Artifact service is not initialized.");
		});
	});
});
