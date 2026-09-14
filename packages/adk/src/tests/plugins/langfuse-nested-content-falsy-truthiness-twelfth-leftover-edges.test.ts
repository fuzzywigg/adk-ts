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

/**
 * Twelfth leftover: nested unwrap is `if (data.content)` truthiness —
 * `""`/`0`/`false` skip unwrap and fall through to JSON.stringify.
 */
describe("langfuse nested-content falsy truthiness twelfth leftover edges", () => {
	beforeEach(() => {
		LangfuseMock.mockClear();
	});

	it.each([
		{ label: "empty-string", content: "" },
		{ label: "0", content: 0 },
		{ label: "false", content: false },
		{ label: "null", content: null },
	])("content $label skips nested unwrap → stringify fallback", ({
		content,
	}) => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const plain = (plugin as any).toPlainText.bind(plugin);
		const data = { content, extra: 1 };

		expect(plain(data)).toBe(JSON.stringify(data, null, 2));
	});

	it("whitespace content is truthy and unwraps to the string itself", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const plain = (plugin as any).toPlainText.bind(plugin);
		expect(plain({ content: " " })).toBe(" ");
	});

	it("truthy nested Content still unwraps (control)", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const plain = (plugin as any).toPlainText.bind(plugin);
		expect(
			plain({ content: { role: "model", parts: [{ text: "nested" }] } }),
		).toBe("nested");
	});
});
