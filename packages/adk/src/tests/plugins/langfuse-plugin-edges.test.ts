import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";

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
	const flushAsync = vi.fn().mockResolvedValue(undefined);
	const shutdownAsync = vi.fn().mockResolvedValue(undefined);
	const LangfuseMock = vi.fn(function Langfuse(this: any) {
		this.trace = traceMock;
		this.flushAsync = flushAsync;
		this.shutdownAsync = shutdownAsync;
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
		invocationId: "inv-edges",
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

describe("LangfusePlugin leftover edges (post #124)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		spanMock.mockImplementation(() => ({
			update: updateMock,
			end: endMock,
			event: eventMock,
			span: spanMock,
			generation: generationMock,
		}));
		generationMock.mockImplementation(() => ({
			update: updateMock,
			end: endMock,
		}));
		traceMock.mockImplementation(() => ({
			update: updateMock,
			event: eventMock,
			span: spanMock,
			generation: generationMock,
		}));
	});

	it("toPlainText uses constructor.name === Event arm when instanceof is false", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const duckEvent = {
			constructor: { name: "Event" },
			content: { role: "model", parts: [{ text: "ctor-name-arm" }] },
		};
		expect((plugin as any).toPlainText(duckEvent)).toBe("ctor-name-arm");
	});

	it("toPlainText prefers nested content unwrap before Event constructor arm", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const nested = {
			constructor: { name: "Event" },
			content: { role: "model", parts: [{ text: "nested-first" }] },
		};
		expect((plugin as any).toPlainText(nested)).toBe("nested-first");
	});

	it("serializeContent returns empty parts when content.parts is missing", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).serializeContent({ role: "model" })).toEqual({
			role: "model",
			parts: [],
		});
		expect((plugin as any).serializeContent(undefined)).toBeNull();
	});

	it("serializePart maps fileData and zero-length inlineData fallback", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect(
			(plugin as any).serializePart({
				inlineData: { mimeType: "text/plain", data: undefined },
			}),
		).toEqual({
			inlineData: { mimeType: "text/plain", dataSize: 0 },
		});
		expect(
			(plugin as any).serializePart({
				fileData: {
					mimeType: "application/pdf",
					fileUri: "gs://bucket/doc.pdf",
				},
			}),
		).toEqual({
			fileData: {
				mimeType: "application/pdf",
				fileUri: "gs://bucket/doc.pdf",
			},
		});
		expect((plugin as any).serializePart({ text: "plain" })).toEqual({
			text: "plain",
		});
	});

	it("recordTokenUsage treats missing input/output/total as zero", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-token-zeros" });
		await plugin.beforeRunCallback({ invocationContext: inv });

		(plugin as any).recordTokenUsage("inv-token-zeros", {});
		(plugin as any).recordTokenUsage("inv-token-zeros", {
			input: 2,
			output: undefined,
			total: undefined,
		});
		(plugin as any).recordTokenUsage("inv-token-zeros", undefined);

		updateMock.mockClear();
		await plugin.afterRunCallback({
			invocationContext: inv,
			result: { role: "model", parts: [{ text: "done" }] },
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					usage: { input: 2, output: 0, total: 0 },
					totalInputTokens: 2,
					totalOutputTokens: 0,
					totalTokens: 0,
				}),
			}),
		);
	});

	it("afterRunCallback resultType is typeof result when no lastEvent exists", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-result-type" });
		await plugin.beforeRunCallback({ invocationContext: inv });
		updateMock.mockClear();

		await plugin.afterRunCallback({
			invocationContext: inv,
			result: "plain-string-result",
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					resultType: "string",
				}),
			}),
		);
	});

	it("afterRunCallback resultType is event when lastEvent is stored", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-last-event-type" });
		await plugin.beforeRunCallback({ invocationContext: inv });

		await plugin.onEventCallback({
			invocationContext: inv,
			event: new Event({
				invocationId: "inv-last-event-type",
				author: "root",
				content: { role: "model", parts: [{ text: "final-text" }] },
			}),
		});
		updateMock.mockClear();

		await plugin.afterRunCallback({
			invocationContext: inv,
			result: { ignored: true },
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					resultType: "event",
				}),
			}),
		);
	});

	it("afterModelCallback records sparse usageMetadata fields as zeros", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-sparse-usage" });
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({
			agent: inv.agent,
			callbackContext,
		});
		const llmRequest = new LlmRequest({ model: "gpt-test" });
		await plugin.beforeModelCallback({
			callbackContext,
			llmRequest,
		});

		await plugin.afterModelCallback({
			callbackContext,
			llmRequest,
			llmResponse: new LlmResponse({
				content: { role: "model", parts: [{ text: "ok" }] },
				usageMetadata: {},
			}),
		});

		updateMock.mockClear();
		await plugin.afterRunCallback({
			invocationContext: inv,
			result: "done",
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					usage: { input: 0, output: 0, total: 0 },
				}),
			}),
		);
	});

	it("serializeContents returns null for undefined and empty arrays", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).serializeContents(undefined)).toBeNull();
		expect((plugin as any).serializeContents([])).toBeNull();
		expect(
			(plugin as any).serializeContents([
				{ role: "user", parts: [{ text: "a" }] },
			]),
		).toEqual([{ role: "user", parts: [{ text: "a" }] }]);
	});

	it("toPlainText stringifies circular objects via catch fallback", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		const text = (plugin as any).toPlainText(circular);
		expect(typeof text).toBe("string");
		expect(text.length).toBeGreaterThan(0);
	});
});
