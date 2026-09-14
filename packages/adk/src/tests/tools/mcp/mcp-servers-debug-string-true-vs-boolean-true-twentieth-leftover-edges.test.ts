import { afterEach, describe, expect, it } from "vitest";
import { McpMemory } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover: createMcpConfig `debug || false` —
 * string "true" kept as string vs boolean true kept as boolean
 * (nineteenth already pins string "false").
 */
describe("mcp servers debug string-true vs boolean-true twentieth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it('debug: "true" kept as string via ||', () => {
		expect((McpMemory({ debug: "true" as any }) as any).config.debug).toBe(
			"true",
		);
	});

	it("debug: true kept as boolean (control)", () => {
		expect((McpMemory({ debug: true }) as any).config.debug).toBe(true);
	});

	it('debug: "false" still kept (nineteenth control)', () => {
		expect((McpMemory({ debug: "false" as any }) as any).config.debug).toBe(
			"false",
		);
	});

	it("debug: false still → false (control)", () => {
		expect((McpMemory({ debug: false }) as any).config.debug).toBe(false);
	});
});
