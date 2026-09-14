import { beforeEach, describe, expect, it, vi } from "vitest";

const { LangfuseMock, flushAsync, shutdownAsync } = vi.hoisted(() => {
	const flushAsync = vi.fn().mockResolvedValue(undefined);
	const shutdownAsync = vi.fn().mockResolvedValue(undefined);
	const LangfuseMock = vi.fn(function Langfuse(this: any) {
		this.trace = vi.fn(() => ({
			update: vi.fn(),
			event: vi.fn(),
			span: vi.fn(),
			generation: vi.fn(),
		}));
		this.flushAsync = flushAsync;
		this.shutdownAsync = shutdownAsync;
	});
	return { LangfuseMock, flushAsync, shutdownAsync };
});

vi.mock("langfuse", () => ({
	Langfuse: LangfuseMock,
}));

import { LangfusePlugin } from "../../plugins/langfuse-plugin";

/**
 * Leftover: serializeContent uses `parts?.map(...) || []` — optional chaining
 * only skips null/undefined, so falsy non-nullish parts (0/false/"") throw
 * before `|| []`. toPlainText drops falsy part.text via if (p.text).
 */
describe("langfuse parts/text falsy ninth leftover edges", () => {
	beforeEach(() => {
		LangfuseMock.mockClear();
		flushAsync.mockClear();
		shutdownAsync.mockClear();
	});

	function plugin() {
		return new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
	}

	it.each([
		0,
		false,
		"",
	] as const)("serializeContent parts: %j throws (?. does not guard non-nullish falsy)", (parts) => {
		const p = plugin();
		const serialize = (p as any).serializeContent.bind(p);
		expect(() => serialize({ role: "user", parts })).toThrow(
			/map is not a function/,
		);
	});

	it.each([
		null,
		undefined,
	] as const)("serializeContent parts: %j coalesces to [] via || (control)", (parts) => {
		const p = plugin();
		const serialize = (p as any).serializeContent.bind(p);
		expect(serialize({ role: "user", parts })).toEqual({
			role: "user",
			parts: [],
		});
	});

	it("serializeContent keeps real parts array (control)", () => {
		const p = plugin();
		const serialize = (p as any).serializeContent.bind(p);
		expect(serialize({ role: "user", parts: [{ text: "hi" }] })).toEqual({
			role: "user",
			parts: [{ text: "hi" }],
		});
	});

	it.each([
		0,
		false,
	] as const)("toPlainText drops falsy text: %j via if (p.text)", (text) => {
		const p = plugin();
		const plain = (p as any).toPlainText.bind(p);
		expect(plain({ parts: [{ text }] })).toBe("");
	});

	it("toPlainText keeps truthy text and drops empty string via filter(Boolean)", () => {
		const p = plugin();
		const plain = (p as any).toPlainText.bind(p);
		expect(
			plain({
				parts: [{ text: "keep" }, { text: "" }, { text: 0 as any }],
			}),
		).toBe("keep");
	});
});
