import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";

const {
	traceMock,
	eventMock,
	spanMock,
	generationMock,
	updateMock,
	endMock,
	LangfuseMock,
} = vi.hoisted(() => {
	const updateMock = vi.fn();
	const endMock = vi.fn();
	const eventMock = vi.fn();
	const spanMock = vi.fn(() => ({
		update: updateMock,
		end: endMock,
		event: eventMock,
		span: vi.fn(),
		generation: vi.fn(),
	}));
	const generationMock = vi.fn(() => ({
		update: updateMock,
		end: endMock,
	}));
	const traceMock = vi.fn(() => ({
		update: updateMock,
		event: eventMock,
		span: spanMock,
		generation: generationMock,
	}));
	const LangfuseMock = vi.fn(function Langfuse(this: any) {
		this.trace = traceMock;
		this.flushAsync = vi.fn().mockResolvedValue(undefined);
		this.shutdownAsync = vi.fn().mockResolvedValue(undefined);
	});
	return {
		traceMock,
		eventMock,
		spanMock,
		generationMock,
		updateMock,
		endMock,
		LangfuseMock,
	};
});

vi.mock("langfuse", () => ({
	Langfuse: LangfuseMock,
}));

import { LangfusePlugin } from "../../plugins/langfuse-plugin";

function makeInvocation(overrides: Record<string, unknown> = {}) {
	return {
		invocationId: "inv-1",
		userId: "user-1",
		appName: "app",
		branch: "main",
		userContent: { role: "user", parts: [{ text: "hello" }] },
		session: { id: "sess-1", state: {} },
		agent: {
			name: "root",
			constructor: { name: "LlmAgent" },
			parentAgent: undefined,
			subAgents: [],
			description: "root agent",
		},
		...overrides,
	} as any;
}

function makeCallbackContext(invocation = makeInvocation()) {
	return {
		invocationId: invocation.invocationId,
		agentName: invocation.agent.name,
		invocationContext: invocation,
	} as any;
}

describe("Langfuse thought/lastEvent/parent/fc-final seventh leftover (post #158)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("toPlainText drops falsy thought via if (p.thought); serializePart keeps thought !== undefined", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const plain = (plugin as any).toPlainText.bind(plugin);
		const serialize = (plugin as any).serializePart.bind(plugin);

		expect(plain({ parts: [{ thought: false }] })).toBe("");
		expect(plain({ parts: [{ thought: 0 }] })).toBe("");
		expect(serialize({ thought: false })).toEqual({ thought: false });
		expect(serialize({ thought: 0 })).toEqual({ thought: 0 });
	});

	it("onEventCallback does not store lastEvent for empty-string text", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const invocation = makeInvocation({ invocationId: "inv-empty-text" });
		const event = new Event({
			invocationId: "inv-empty-text",
			author: "root",
			content: { role: "model", parts: [{ text: "" }] },
		});

		await plugin.onEventCallback({
			invocationContext: invocation,
			event,
		});

		expect((plugin as any).lastEventByInvocation.has("inv-empty-text")).toBe(
			false,
		);
	});

	it("onEventCallback stores lastEvent for codeExecutionResult even without text", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const invocation = makeInvocation({ invocationId: "inv-code" });
		const event = new Event({
			invocationId: "inv-code",
			author: "root",
			content: {
				role: "model",
				parts: [{ codeExecutionResult: { outcome: "OK", output: "2" } }],
			},
		});

		await plugin.onEventCallback({
			invocationContext: invocation,
			event,
		});

		expect((plugin as any).lastEventByInvocation.get("inv-code")).toBe(event);
	});

	it("FC + skipSummarization still names *.function_call (FC length wins)", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const invocation = makeInvocation();
		const event = new Event({
			invocationId: "inv-1",
			author: "worker",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "search", args: {} } }],
			},
			actions: { skipSummarization: true } as any,
		});
		expect(event.isFinalResponse()).toBe(true);

		await plugin.onEventCallback({
			invocationContext: invocation,
			event,
		});

		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: "worker.function_call" }),
		);
	});

	it("afterAgentCallback skips parent completed event when parentSpan missing", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const parentAgent = {
			name: "parent",
			constructor: { name: "LlmAgent" },
			parentAgent: undefined,
			subAgents: [],
			description: "parent",
		};
		const childAgent = {
			name: "child",
			constructor: { name: "LlmAgent" },
			parentAgent,
			subAgents: [],
			description: "child",
		};
		const invocation = makeInvocation({
			invocationId: "inv-orphan",
			agent: childAgent,
		});

		await plugin.beforeAgentCallback({
			agent: childAgent as any,
			callbackContext: makeCallbackContext(invocation),
		});
		expect((plugin as any).agentSpans.has("inv-orphan:agent:child")).toBe(true);
		expect((plugin as any).agentSpans.has("inv-orphan:agent:parent")).toBe(
			false,
		);

		eventMock.mockClear();
		await plugin.afterAgentCallback({
			agent: childAgent as any,
			callbackContext: makeCallbackContext(invocation),
			result: { ok: true },
		});

		expect(eventMock).not.toHaveBeenCalledWith(
			expect.objectContaining({ name: "child_completed" }),
		);
		expect(endMock).toHaveBeenCalled();
	});
});
