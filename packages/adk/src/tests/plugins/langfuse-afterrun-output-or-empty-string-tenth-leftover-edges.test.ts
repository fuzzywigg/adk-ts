import { beforeEach, describe, expect, it, vi } from "vitest";

const { eventMock, updateMock, LangfuseMock } = vi.hoisted(() => {
	const updateMock = vi.fn();
	const eventMock = vi.fn();
	const traceMock = vi.fn(() => ({
		update: updateMock,
		event: eventMock,
		span: vi.fn(),
		generation: vi.fn(),
	}));
	const LangfuseMock = vi.fn(function Langfuse(this: any) {
		this.trace = traceMock;
		this.flushAsync = vi.fn().mockResolvedValue(undefined);
		this.shutdownAsync = vi.fn().mockResolvedValue(undefined);
	});
	return { eventMock, updateMock, LangfuseMock };
});

vi.mock("langfuse", () => ({
	Langfuse: LangfuseMock,
}));

import { LangfusePlugin } from "../../plugins/langfuse-plugin";

function makeInvocation() {
	return {
		invocationId: "inv-10",
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
	} as any;
}

/**
 * Tenth leftover: afterRunCallback gates `if (output || outputText)` —
 * empty-string result skips run_complete; numeric 0 / false stringify to
 * truthy text and still emit.
 */
describe("langfuse afterRun output || empty-string tenth leftover edges", () => {
	let plugin: LangfusePlugin;
	let invocation: ReturnType<typeof makeInvocation>;

	beforeEach(async () => {
		eventMock.mockClear();
		updateMock.mockClear();
		plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		invocation = makeInvocation();
		await plugin.beforeRunCallback({ invocationContext: invocation });
		eventMock.mockClear();
		updateMock.mockClear();
	});

	it("empty-string result skips run_complete (both output and outputText falsy)", async () => {
		await plugin.afterRunCallback({
			invocationContext: invocation,
			result: "",
		});
		expect(
			eventMock.mock.calls.some((c) => c[0]?.name === "run_complete"),
		).toBe(false);
	});

	it("numeric 0 result still emits run_complete via toPlainText String(0)", async () => {
		await plugin.afterRunCallback({
			invocationContext: invocation,
			result: 0,
		});
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "run_complete",
				output: 0,
			}),
		);
	});

	it("boolean false result still emits run_complete via toPlainText", async () => {
		await plugin.afterRunCallback({
			invocationContext: invocation,
			result: false,
		});
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "run_complete",
				output: false,
			}),
		);
	});

	it("whitespace result is truthy and emits run_complete", async () => {
		await plugin.afterRunCallback({
			invocationContext: invocation,
			result: " ",
		});
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "run_complete",
				output: " ",
			}),
		);
	});
});
