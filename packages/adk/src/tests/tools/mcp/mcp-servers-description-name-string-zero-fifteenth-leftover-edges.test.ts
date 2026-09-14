import { describe, expect, it } from "vitest";
import { McpGeneric, McpMemory } from "../../../tools/mcp/servers";

/**
 * Fifteenth leftover: `description || \`Client for ${name}\`` and
 * `name || \`${package} Client\`` — string `"0"` / `"false"` are truthy and
 * kept (thirteenth covered falsy coalesce + whitespace, not these).
 */
describe("mcp servers description/name string-zero fifteenth leftover", () => {
	it('description: "0" is kept (truthy || skip)', () => {
		expect((McpMemory({ description: "0" }) as any).config.description).toBe(
			"0",
		);
	});

	it('description: "false" is kept (truthy || skip)', () => {
		expect(
			(McpMemory({ description: "false" }) as any).config.description,
		).toBe("false");
	});

	it('McpGeneric name: "0" is kept instead of package Client fallback', () => {
		expect((McpGeneric("@example/pkg", {}, "0") as any).config.name).toBe("0");
	});

	it('McpGeneric name: "false" is kept', () => {
		expect((McpGeneric("@example/pkg", {}, "false") as any).config.name).toBe(
			"false",
		);
	});

	it("empty description still coalesces (control)", () => {
		expect((McpMemory({ description: "" }) as any).config.description).toBe(
			"Client for Memory MCP Client",
		);
	});
});
