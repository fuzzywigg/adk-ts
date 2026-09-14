import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";

const {
	traceMock,
	eventMock,
	spanMock,
	generationMock,
	updateMock,
	endMock,
	flushAsync,
	shutdownAsync,
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
		flushAsync,
		shutdownAsync,
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

describe("LangfusePlugin leftover edges", () => {
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

	it("toPlainText unwraps nested content and double-nested wrappers", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const plain = (plugin as any).toPlainText.bind(plugin);

		expect(
			plain({ content: { role: "model", parts: [{ text: "nested" }] } }),
		).toBe("nested");

		expect(
			plain({
				content: {
					content: { role: "model", parts: [{ text: "deep-nested" }] },
				},
			}),
		).toBe("deep-nested");
	});

	it("toPlainText falls back to String when JSON.stringify throws", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const circular: any = { label: "loop" };
		circular.self = circular;

		const result = (plugin as any).toPlainText(circular);
		expect(result).toBe(String(circular));
		expect(result).toContain("[object Object]");
	});

	it("serializeContent returns null for undefined and empty parts for role-only", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });

		expect((plugin as any).serializeContent(undefined)).toBeNull();
		expect((plugin as any).serializeContent({ role: "user" })).toEqual({
			role: "user",
			parts: [],
		});
	});

	it("serializePart treats missing or undefined inlineData.data as dataSize 0", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });

		expect(
			(plugin as any).serializePart({
				inlineData: { mimeType: "image/png" },
			}),
		).toEqual({
			inlineData: { mimeType: "image/png", dataSize: 0 },
		});

		expect(
			(plugin as any).serializePart({
				inlineData: { mimeType: "x", data: undefined },
			}),
		).toEqual({
			inlineData: { mimeType: "x", dataSize: 0 },
		});
	});

	it("recordTokenUsage early-returns on undefined and coerces missing fields with ?? 0", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const record = (plugin as any).recordTokenUsage.bind(plugin);

		record("inv", undefined);
		expect((plugin as any).tokenUsage.has("inv")).toBe(false);

		record("inv", {});
		expect((plugin as any).tokenUsage.get("inv")).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
		});

		record("inv", { input: 1 });
		expect((plugin as any).tokenUsage.get("inv")).toEqual({
			inputTokens: 1,
			outputTokens: 0,
			totalTokens: 0,
		});
	});

	it("afterRunCallback uses serialized output when outputText is empty", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-empty-text" });
		await plugin.beforeRunCallback({ invocationContext: inv });
		updateMock.mockClear();
		eventMock.mockClear();

		await plugin.afterRunCallback({
			invocationContext: inv,
			result: {
				content: {
					role: "model",
					parts: [{ text: "" }, {}],
				},
			},
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				output: {
					role: "model",
					parts: [{ text: "" }, {}],
				},
				metadata: expect.objectContaining({
					outputText: "",
				}),
			}),
		);
		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "run_complete",
				output: {
					role: "model",
					parts: [{ text: "" }, {}],
				},
			}),
		);
	});

	it.each([
		["bigint", () => BigInt(42), "42"],
		["symbol", () => Symbol.for("langfuse-edge"), undefined],
		["date", () => new Date("2020-01-02T03:04:05.000Z"), undefined],
		["empty-array", () => [], ""],
		["string-array", () => ["a", "b"], "a\n\nb"],
		[
			"content-array",
			() => [
				{ role: "user", parts: [{ text: "u" }] },
				{ role: "model", parts: [{ text: "m" }] },
			],
			"u\n\nm",
		],
	])("toPlainText matrix: %s", (_label, factory, expected) => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const value = factory();
		const result = (plugin as any).toPlainText(value);

		if (_label === "date") {
			expect(result).toContain("2020-01-02");
		} else if (_label === "symbol") {
			expect(result === undefined || typeof result === "string").toBe(true);
		} else {
			expect(result).toBe(expected);
		}
	});

	it("toPlainText String-coerces Symbol via catch-free stringify undefined path", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const sym = Symbol("edge");
		const result = (plugin as any).toPlainText(sym);
		// JSON.stringify(Symbol) returns undefined without throwing
		expect(result).toBeUndefined();
		expect(String(sym)).toContain("Symbol");
	});

	it.each([
		[
			"executableCode",
			{
				executableCode: { language: "PYTHON", code: "print(1)" },
			},
			{
				executableCode: { language: "PYTHON", code: "print(1)" },
			},
		],
		[
			"codeExecutionResult",
			{
				codeExecutionResult: { outcome: "OK", output: "1" },
			},
			{
				codeExecutionResult: { outcome: "OK", output: "1" },
			},
		],
		["thought", { thought: true }, { thought: true }],
		[
			"fileData",
			{
				fileData: {
					mimeType: "text/plain",
					fileUri: "gs://bucket/f.txt",
				},
			},
			{
				fileData: {
					mimeType: "text/plain",
					fileUri: "gs://bucket/f.txt",
				},
			},
		],
	])("serializePart matrix alone: %s", (_label, part, expected) => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).serializePart(part)).toEqual(expected);
	});

	it("recordTokenUsage accumulates across invocations independently", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const record = (plugin as any).recordTokenUsage.bind(plugin);

		record("inv-a", { input: 2, output: 3, total: 5 });
		record("inv-a", { input: 4, output: undefined, total: 1 });
		record("inv-b", { input: 10 });
		record("inv-b", { output: 7, total: 9 });
		record("inv-c", {});

		expect((plugin as any).tokenUsage.get("inv-a")).toEqual({
			inputTokens: 6,
			outputTokens: 3,
			totalTokens: 6,
		});
		expect((plugin as any).tokenUsage.get("inv-b")).toEqual({
			inputTokens: 10,
			outputTokens: 7,
			totalTokens: 9,
		});
		expect((plugin as any).tokenUsage.get("inv-c")).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
		});
	});

	it("afterRunCallback with functionCall-only content still yields non-empty text", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-fc-only" });
		await plugin.beforeRunCallback({ invocationContext: inv });
		updateMock.mockClear();

		await plugin.afterRunCallback({
			invocationContext: inv,
			result: {
				content: {
					role: "model",
					parts: [{ functionCall: { name: "lookup", args: {} } }],
				},
			},
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				output: "[Function Call: lookup]",
			}),
		);
	});

	it("keeps Event import reachable for instanceof-adjacent regressions", () => {
		expect(new Event({ author: "root" }).author).toBe("root");
	});
});
