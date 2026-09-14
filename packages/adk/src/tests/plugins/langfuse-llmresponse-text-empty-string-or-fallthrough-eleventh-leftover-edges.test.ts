import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";

const { spanMock, generationMock, updateMock, endMock, LangfuseMock } =
	vi.hoisted(() => {
		const updateMock = vi.fn();
		const endMock = vi.fn();
		const generationMock = vi.fn(() => ({
			update: updateMock,
			end: endMock,
		}));
		const spanMock = vi.fn(() => ({
			update: updateMock,
			end: endMock,
			event: vi.fn(),
			span: vi.fn(),
			generation: generationMock,
		}));
		const traceMock = vi.fn(() => ({
			update: updateMock,
			event: vi.fn(),
			span: spanMock,
			generation: generationMock,
		}));
		const flushAsync = vi.fn().mockResolvedValue(undefined);
		const shutdownAsync = vi.fn().mockResolvedValue(undefined);
		const LangfuseMock = vi.fn(function Langfuse(this: any) {
			this.trace = traceMock;
			this.flushAsync = flushAsync;
			this.shutdownAsync = shutdownAsync;
		});
		return {
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
		invocationId: "inv-11",
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

/**
 * Eleventh leftover: `llmResponse.text || toPlainText(content)` — empty string
 * falls through to content; whitespace " " is kept as preference.
 * Distinct from || "unknown" key leftovers and prefer-nonempty main test.
 */
describe("langfuse llmResponse.text empty-string or fallthrough eleventh leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		spanMock.mockImplementation(() => ({
			update: updateMock,
			end: endMock,
			event: vi.fn(),
			span: vi.fn(),
			generation: generationMock,
		}));
		generationMock.mockImplementation(() => ({
			update: updateMock,
			end: endMock,
		}));
	});

	async function runAfterModel(llmResponse: LlmResponse) {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation();
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({ agent: inv.agent, callbackContext });
		const llmRequest = new LlmRequest({ model: "m1" });
		await plugin.beforeModelCallback({ callbackContext, llmRequest });
		updateMock.mockClear();
		await plugin.afterModelCallback({
			callbackContext,
			llmRequest,
			llmResponse,
		});
		return updateMock.mock.calls.map((c) => c[0]);
	}

	it('text: "" falls through to content plain text', async () => {
		const updates = await runAfterModel(
			new LlmResponse({
				content: { role: "model", parts: [{ text: "from-content" }] },
				text: "",
			}),
		);
		expect(updates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					metadata: expect.objectContaining({
						outputText: "from-content",
						textPreview: "from-content",
					}),
				}),
			]),
		);
	});

	it.each([
		{ label: "null", text: null as any },
		{ label: "undefined", text: undefined },
		{ label: "false", text: false as any },
		{ label: "0", text: 0 as any },
	])("falsy text ($label) falls through to content", async ({ text }) => {
		const updates = await runAfterModel(
			new LlmResponse({
				content: { role: "model", parts: [{ text: "fallback" }] },
				text,
			}),
		);
		expect(updates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					metadata: expect.objectContaining({
						outputText: "fallback",
					}),
				}),
			]),
		);
	});

	it('whitespace text " " is truthy and preferred over content', async () => {
		const updates = await runAfterModel(
			new LlmResponse({
				content: { role: "model", parts: [{ text: "content-ignored" }] },
				text: " ",
			}),
		);
		expect(updates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					metadata: expect.objectContaining({
						outputText: " ",
						textPreview: " ",
					}),
				}),
			]),
		);
	});

	it("non-empty text still wins (control)", async () => {
		const updates = await runAfterModel(
			new LlmResponse({
				content: { role: "model", parts: [{ text: "content" }] },
				text: "explicit",
			}),
		);
		expect(updates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					metadata: expect.objectContaining({
						outputText: "explicit",
					}),
				}),
			]),
		);
	});
});
