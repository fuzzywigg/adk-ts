import { describe, expect, it, vi } from "vitest";

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

describe("LangfusePlugin ?? defaults leftover (post #168)", () => {
	it("flushAt: 0 is kept via ?? (not coalesced to 1)", () => {
		LangfuseMock.mockClear();
		const plugin = new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
			flushAt: 0,
		});
		expect(plugin.name).toBe("langfuse_plugin");
		expect(LangfuseMock).toHaveBeenCalledWith(
			expect.objectContaining({ flushAt: 0 }),
		);
	});

	it("flushInterval: 0 is kept via ?? (not coalesced to 1000)", () => {
		LangfuseMock.mockClear();
		new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
			flushInterval: 0,
		});
		expect(LangfuseMock).toHaveBeenCalledWith(
			expect.objectContaining({ flushInterval: 0 }),
		);
	});

	it("empty-string name is kept via ?? (not defaulted to langfuse_plugin)", () => {
		LangfuseMock.mockClear();
		const plugin = new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
			name: "",
		});
		expect(plugin.name).toBe("");
	});

	it("omitted flushAt/flushInterval/name use ?? defaults", () => {
		LangfuseMock.mockClear();
		const plugin = new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
		});
		expect(plugin.name).toBe("langfuse_plugin");
		expect(LangfuseMock).toHaveBeenCalledWith(
			expect.objectContaining({
				flushAt: 1,
				flushInterval: 1000,
				baseUrl: "https://us.cloud.langfuse.com",
			}),
		);
	});

	it("null name and null flushAt coalesce via ??", () => {
		LangfuseMock.mockClear();
		const plugin = new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
			name: null as any,
			flushAt: null as any,
			flushInterval: null as any,
		});
		expect(plugin.name).toBe("langfuse_plugin");
		expect(LangfuseMock).toHaveBeenCalledWith(
			expect.objectContaining({
				flushAt: 1,
				flushInterval: 1000,
			}),
		);
	});
});
