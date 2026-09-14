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

describe("LangfusePlugin flushAt/flushInterval 0-vs-nullish fifth leftover (post #165)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{
			label: "flushAt:0",
			opts: { flushAt: 0 },
			expectFlushAt: 0,
			expectInterval: 1000,
		},
		{
			label: "flushInterval:0",
			opts: { flushInterval: 0 },
			expectFlushAt: 1,
			expectInterval: 0,
		},
		{
			label: "both zero",
			opts: { flushAt: 0, flushInterval: 0 },
			expectFlushAt: 0,
			expectInterval: 0,
		},
	] as const)("keeps explicit 0 via ?? for $label (does not fall back to defaults)", ({
		opts,
		expectFlushAt,
		expectInterval,
	}) => {
		new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
			...opts,
		});
		expect(LangfuseMock).toHaveBeenCalledWith(
			expect.objectContaining({
				flushAt: expectFlushAt,
				flushInterval: expectInterval,
			}),
		);
	});

	it.each([
		{ label: "undefined", flushAt: undefined, flushInterval: undefined },
		{ label: "null", flushAt: null, flushInterval: null },
	] as const)("nullish $label flush options coalesce to defaults (1 / 1000)", ({
		flushAt,
		flushInterval,
	}) => {
		new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
			flushAt: flushAt as any,
			flushInterval: flushInterval as any,
		});
		expect(LangfuseMock).toHaveBeenCalledWith(
			expect.objectContaining({
				flushAt: 1,
				flushInterval: 1000,
			}),
		);
	});

	it.each([
		{ label: "null name", name: null, expected: "langfuse_plugin" },
		{ label: "undefined name", name: undefined, expected: "langfuse_plugin" },
		{ label: '"" name kept', name: "", expected: "" },
	] as const)("name ?? default: $label", ({ name, expected }) => {
		const plugin = new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
			name: name as any,
		});
		expect(plugin.name).toBe(expected);
	});

	it.each([
		{
			label: "null baseUrl",
			baseUrl: null,
			expected: "https://us.cloud.langfuse.com",
		},
		{
			label: "undefined baseUrl",
			baseUrl: undefined,
			expected: "https://us.cloud.langfuse.com",
		},
		{
			label: '"" baseUrl kept via ??',
			baseUrl: "",
			expected: "",
		},
	] as const)("baseUrl ?? default: $label", ({ baseUrl, expected }) => {
		new LangfusePlugin({
			publicKey: "pk",
			secretKey: "sk",
			baseUrl: baseUrl as any,
		});
		expect(LangfuseMock).toHaveBeenCalledWith(
			expect.objectContaining({ baseUrl: expected }),
		);
	});
});
