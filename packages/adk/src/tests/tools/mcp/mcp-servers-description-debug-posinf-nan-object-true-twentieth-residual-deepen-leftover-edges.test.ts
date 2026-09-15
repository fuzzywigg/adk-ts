import { afterEach, describe, expect, it } from "vitest";
import { McpMemory } from "../../../tools/mcp/servers";

/**
 * HEAVY tip-relaunch residual deepen after tip 1f70668 / post #286 (lands closed #278 onto tip; complements #259 true/negzero):
 * createMcpConfig `description ||` / `debug || false` — POSITIVE_INFINITY /
 * `1` / `{}` / `Object(true)` kept; `NaN` collapses. Twentieth pinned `-0`.
 */
describe("mcp servers description/debug posinf/nan/object-true twentieth residual deepen", () => {
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
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("description $label kept via ||", ({ value }) => {
		const config = (McpMemory({ description: value as any }) as any).config;
		expect(config.description).toBe(value);
	});

	it("description NaN collapses to Client for Memory MCP Client via ||", () => {
		const config = (McpMemory({ description: Number.NaN as any }) as any)
			.config;
		expect(config.description).toBe("Client for Memory MCP Client");
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("debug $label kept via || false", ({ value }) => {
		expect((McpMemory({ debug: value as any }) as any).config.debug).toBe(
			value,
		);
	});

	it("debug NaN collapses to false via ||", () => {
		expect((McpMemory({ debug: Number.NaN as any }) as any).config.debug).toBe(
			false,
		);
	});
});
