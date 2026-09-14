import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";

class ConfigurableTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly decl: any,
	) {
		super(config);
	}

	getDeclaration() {
		return this.decl;
	}

	async runAsync(args: Record<string, any>, _context: ToolContext) {
		return { ok: true, args };
	}
}

/**
 * Fifteenth leftover: `required || []` then `for…of` — a truthy string is
 * iterated by character, so required: "ab" checks keys "a" and "b".
 */
describe("base-tool required string iterate fifteenth leftover", () => {
	it('required: "ab" validates when args have a and b keys', () => {
		const tool = new ConfigurableTool(
			{
				name: "req_chars",
				description: "Required string iterates by character",
			},
			{
				name: "req_chars",
				parameters: {
					type: Type.OBJECT,
					properties: {
						a: { type: Type.NUMBER },
						b: { type: Type.NUMBER },
					},
					required: "ab" as any,
				},
			},
		);
		expect(tool.validateArguments({ a: 1, b: 2 })).toBe(true);
		expect(tool.validateArguments({ ab: 1 })).toBe(false);
	});

	it('required: "" coalesces via || [] so validation passes', () => {
		const tool = new ConfigurableTool(
			{
				name: "req_empty",
				description: "Empty required string coalesces to empty array",
			},
			{
				name: "req_empty",
				parameters: {
					type: Type.OBJECT,
					properties: { q: { type: Type.STRING } },
					required: "" as any,
				},
			},
		);
		expect(tool.validateArguments({})).toBe(true);
	});

	it("array required still checks full key names (control)", () => {
		const tool = new ConfigurableTool(
			{
				name: "req_array",
				description: "Normal array required keys",
			},
			{
				name: "req_array",
				parameters: {
					type: Type.OBJECT,
					properties: { ab: { type: Type.STRING } },
					required: ["ab"],
				},
			},
		);
		expect(tool.validateArguments({ ab: "x" })).toBe(true);
		expect(tool.validateArguments({ a: 1, b: 2 })).toBe(false);
	});
});
