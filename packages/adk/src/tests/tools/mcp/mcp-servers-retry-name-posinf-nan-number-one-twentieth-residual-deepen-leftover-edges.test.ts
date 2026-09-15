import { afterEach, describe, expect, it } from "vitest";
import { McpGeneric, McpMemory } from "../../../tools/mcp/servers";

/**
 * HEAVY tip-relaunch residual deepen after tip 5156762 / post #292 (lands closed #290/#278 onto tip; complements #259 true/negzero):
 * `retryOptions || defaults` / McpGeneric `name ||` — POSITIVE_INFINITY /
 * `1` / `Object(true)` kept; `NaN` collapses. Skip `{}` (thirteenth empty
 * object keep on retryOptions).
 */
describe("mcp servers retry/name posinf/nan/number-one twentieth residual deepen", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "Object(true)", value: Object(true) },
	])("retryOptions $label kept via || defaults", ({ value }) => {
		const config = (McpMemory({ retryOptions: value as any }) as any).config;
		expect(config.retryOptions).toBe(value);
	});

	it("retryOptions NaN collapses to defaults via ||", () => {
		const config = (McpMemory({ retryOptions: Number.NaN as any }) as any)
			.config;
		expect(config.retryOptions).toEqual({ maxRetries: 2, initialDelay: 200 });
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "Object(true)", value: Object(true) },
	])("McpGeneric name $label kept via ||", ({ value }) => {
		expect(
			(McpGeneric("@example/pkg", {}, value as any) as any).config.name,
		).toBe(value);
	});

	it("McpGeneric name NaN collapses to package Client via ||", () => {
		expect(
			(McpGeneric("@example/pkg", {}, Number.NaN as any) as any).config.name,
		).toBe("@example/pkg Client");
	});
});
