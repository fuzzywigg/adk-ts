import { beforeEach, describe, expect, it, vi } from "vitest";

const { LangfuseMock } = vi.hoisted(() => {
	const LangfuseMock = vi.fn(function Langfuse(this: any) {
		this.trace = vi.fn();
		this.flushAsync = vi.fn().mockResolvedValue(undefined);
		this.shutdownAsync = vi.fn().mockResolvedValue(undefined);
	});
	return { LangfuseMock };
});

vi.mock("langfuse", () => ({
	Langfuse: LangfuseMock,
}));

import { LangfusePlugin } from "../../plugins/langfuse-plugin";

describe("LangfusePlugin span/generation key falsy→unknown fifth leftover (post #165)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: '""', value: "" },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
	] as const)('getToolSpanKey uses "unknown" when functionCallId is falsy $label via ||', ({
		value,
	}) => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).getToolSpanKey("inv-1", value as any)).toBe(
			"inv-1:tool:unknown",
		);
	});

	it("getToolSpanKey keeps truthy functionCallId including whitespace", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).getToolSpanKey("inv-1", "fc-9")).toBe(
			"inv-1:tool:fc-9",
		);
		expect((plugin as any).getToolSpanKey("inv-1", "   ")).toBe(
			"inv-1:tool:   ",
		);
	});

	it.each([
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: '""', value: "" },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
	] as const)('getGenerationKey uses "unknown" when model is falsy $label via ||', ({
		value,
	}) => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).getGenerationKey("inv-2", value as any)).toBe(
			"inv-2:gen:unknown",
		);
	});

	it("getGenerationKey keeps truthy model strings", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).getGenerationKey("inv-2", "gemini-2.0-flash")).toBe(
			"inv-2:gen:gemini-2.0-flash",
		);
	});

	it.each([
		{ label: '"" data', data: "", expected: 0 },
		{ label: "null data", data: null, expected: 0 },
		{ label: "undefined data", data: undefined, expected: 0 },
		{ label: "length-3 string", data: "abc", expected: 3 },
	] as const)("serializePart inlineData.data?.length || 0: $label", ({
		data,
		expected,
	}) => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect(
			(plugin as any).serializePart({
				inlineData: { mimeType: "image/png", data: data as any },
			}),
		).toEqual({
			inlineData: { mimeType: "image/png", dataSize: expected },
		});
	});
});
