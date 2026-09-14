import { afterEach, describe, expect, it } from "vitest";
import { McpAtp, McpGeneric } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover: `retryOptions || defaults` keeps boolean `true` (truthy
 * non-object); McpGeneric `name || \`${pkg} Client\`` keeps `"true"`/`"false"`
 * and boolean `true` (thirteenth pinned falsy → fallback).
 */
describe("mcp servers retryOptions true + generic name true twentieth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it("retryOptions: true is truthy and kept (no defaults merged)", () => {
		expect(
			(McpAtp({ retryOptions: true as any }) as any).config.retryOptions,
		).toBe(true);
	});

	it('retryOptions: "true" kept as string via ||', () => {
		expect(
			(McpAtp({ retryOptions: "true" as any }) as any).config.retryOptions,
		).toBe("true");
	});

	it.each([
		"true",
		"false",
	] as const)("McpGeneric name %j kept via ||", (name) => {
		expect((McpGeneric("@example/pkg", {}, name) as any).config.name).toBe(
			name,
		);
	});

	it("McpGeneric name: boolean true kept (truthy || skip)", () => {
		expect(
			(McpGeneric("@example/pkg", {}, true as any) as any).config.name,
		).toBe(true);
	});

	it("McpGeneric name: boolean false falls back to package Client", () => {
		expect(
			(McpGeneric("@example/pkg", {}, false as any) as any).config.name,
		).toBe("@example/pkg Client");
	});
});
