import { beforeEach, describe, expect, it, vi } from "vitest";

const { LangfuseMock } = vi.hoisted(() => {
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
	return { LangfuseMock };
});

vi.mock("langfuse", () => ({
	Langfuse: LangfuseMock,
}));

import { LangfusePlugin } from "../../plugins/langfuse-plugin";

describe("LangfusePlugin deepen edges (TOKENMAXX remainder)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("toPlainText maps every non-text part kind", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const plain = (plugin as any).toPlainText.bind(plugin);

		expect(
			plain({
				role: "model",
				parts: [
					{ functionCall: { name: "search" } },
					{ functionResponse: { name: "search" } },
					{ thought: "ponder" },
					{ executableCode: { language: "python", code: "1+1" } },
					{ codeExecutionResult: { outcome: "OK", output: "2" } },
				],
			}),
		).toBe(
			[
				"[Function Call: search]",
				"[Function Response: search]",
				"[Thought: ponder]",
				"[Code: python]",
				"[Code Result: OK]",
			].join("\n"),
		);
	});

	it("toPlainText drops empty part kind fallthroughs", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const plain = (plugin as any).toPlainText.bind(plugin);
		expect(plain({ parts: [{}, { text: "" }, { inlineData: {} }] })).toBe("");
	});

	it("toPlainText joins arrays of content with blank-line separators", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const plain = (plugin as any).toPlainText.bind(plugin);
		expect(
			plain([
				{ parts: [{ text: "one" }] },
				{ parts: [{ text: "two" }] },
				{ parts: [] },
			]),
		).toBe("one\n\ntwo");
	});

	it("toPlainText stringifies primitives and objects", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const plain = (plugin as any).toPlainText.bind(plugin);
		expect(plain(null)).toBe("");
		expect(plain(undefined)).toBe("");
		expect(plain("raw")).toBe("raw");
		expect(plain(12)).toBe("12");
		expect(plain(true)).toBe("true");
		expect(plain({ foo: "bar" })).toContain('"foo"');
	});

	it("serializePart retains each structured field family", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const serializePart = (plugin as any).serializePart.bind(plugin);

		expect(
			serializePart({
				text: "hi",
				functionCall: { name: "f", args: { a: 1 }, id: "c1" },
				functionResponse: { name: "f", response: { ok: true }, id: "r1" },
				inlineData: { mimeType: "image/png", data: "abcd" },
				fileData: { mimeType: "text/plain", fileUri: "gs://x" },
				thought: true,
				executableCode: { language: "js", code: "1" },
				codeExecutionResult: { outcome: "OK", output: "1" },
			}),
		).toEqual({
			text: "hi",
			functionCall: { name: "f", args: { a: 1 }, id: "c1" },
			functionResponse: { name: "f", response: { ok: true }, id: "r1" },
			inlineData: { mimeType: "image/png", dataSize: 4 },
			fileData: { mimeType: "text/plain", fileUri: "gs://x" },
			thought: true,
			executableCode: { language: "js", code: "1" },
			codeExecutionResult: { outcome: "OK", output: "1" },
		});
	});

	it("serializeContent/serializeContents handle nullish and empty", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const serializeContent = (plugin as any).serializeContent.bind(plugin);
		const serializeContents = (plugin as any).serializeContents.bind(plugin);

		expect(serializeContent(undefined)).toBeNull();
		expect(serializeContent(null)).toBeNull();
		expect(serializeContents(undefined)).toBeNull();
		expect(serializeContents([])).toBeNull();
		expect(
			serializeContents([{ role: "user", parts: [{ text: "a" }] }]),
		).toEqual([{ role: "user", parts: [{ text: "a" }] }]);
		expect(serializeContent({ role: "model" })).toEqual({
			role: "model",
			parts: [],
		});
	});

	it("serializePart uses dataSize 0 when inlineData.data is missing", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const serializePart = (plugin as any).serializePart.bind(plugin);
		expect(
			serializePart({
				inlineData: { mimeType: "application/octet-stream" },
			}),
		).toEqual({
			inlineData: { mimeType: "application/octet-stream", dataSize: 0 },
		});
	});
});
