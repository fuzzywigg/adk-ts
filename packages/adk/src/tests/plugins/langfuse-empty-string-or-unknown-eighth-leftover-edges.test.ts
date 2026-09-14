import { beforeEach, describe, expect, it, vi } from "vitest";

const { LangfuseMock, flushAsync, shutdownAsync } = vi.hoisted(() => {
	const flushAsync = vi.fn().mockResolvedValue(undefined);
	const shutdownAsync = vi.fn().mockResolvedValue(undefined);
	const LangfuseMock = vi.fn(function Langfuse(this: any, opts: any) {
		this.opts = opts;
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
 * Leftover: name uses `??` (empty string kept) while functionCallId/model use
 * `|| "unknown"`; flushAt/flushInterval keep 0 via `??`.
 */
describe("langfuse empty-string or-unknown eighth leftover edges", () => {
	beforeEach(() => {
		LangfuseMock.mockClear();
		flushAsync.mockClear();
		shutdownAsync.mockClear();
	});

	it("keeps empty-string plugin name via ??", () => {
		const plugin = new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
			name: "",
		});
		expect(plugin.name).toBe("");
	});

	it("defaults omitted name via ??", () => {
		const plugin = new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
		});
		expect(plugin.name).toBe("langfuse_plugin");
	});

	it("keeps flushAt: 0 and flushInterval: 0 via ??", () => {
		new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
			flushAt: 0,
			flushInterval: 0,
		});
		expect(LangfuseMock).toHaveBeenCalledWith(
			expect.objectContaining({
				flushAt: 0,
				flushInterval: 0,
			}),
		);
	});

	it("coalesces empty functionCallId/model to unknown via ||", () => {
		const plugin = new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
		});
		expect((plugin as any).getToolSpanKey("inv", "")).toBe("inv:tool:unknown");
		expect((plugin as any).getToolSpanKey("inv", undefined)).toBe(
			"inv:tool:unknown",
		);
		expect((plugin as any).getGenerationKey("inv", "")).toBe("inv:gen:unknown");
		expect((plugin as any).getGenerationKey("inv", undefined)).toBe(
			"inv:gen:unknown",
		);
		expect((plugin as any).getToolSpanKey("inv", "fc-1")).toBe("inv:tool:fc-1");
		expect((plugin as any).getGenerationKey("inv", "gpt")).toBe("inv:gen:gpt");
	});
});
