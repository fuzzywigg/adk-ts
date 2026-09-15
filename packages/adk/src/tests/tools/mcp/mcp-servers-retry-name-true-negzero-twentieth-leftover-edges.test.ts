import { afterEach, describe, expect, it } from "vitest";
import { McpAtp, McpGeneric } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after thirteenth or-coalesce):
 * `retryOptions || defaults` and McpGeneric `name || \`${pkg} Client\`` —
 * boolean `true` / `"true"` / `[]` / `NEGATIVE_INFINITY` kept; `-0` collapses.
 * Thirteenth pinned classic falsy + empty-object keep.
 */
describe("mcp servers retryOptions/name true/negzero twentieth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("retryOptions $label kept via || (no defaults merge)", ({ value }) => {
		expect(
			(McpAtp({ retryOptions: value as any }) as any).config.retryOptions,
		).toBe(value);
	});

	it("retryOptions -0 collapses to {maxRetries:2, initialDelay:200}", () => {
		expect(
			(McpAtp({ retryOptions: -0 as any }) as any).config.retryOptions,
		).toEqual({ maxRetries: 2, initialDelay: 200 });
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty array", value: [] as never[] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("McpGeneric name $label kept via ||", ({ value }) => {
		expect(
			(McpGeneric("@example/pkg", {}, value as any) as any).config.name,
		).toBe(value);
	});

	it("McpGeneric name -0 falls back to package Client suffix", () => {
		expect((McpGeneric("@example/pkg", {}, -0 as any) as any).config.name).toBe(
			"@example/pkg Client",
		);
	});
});
