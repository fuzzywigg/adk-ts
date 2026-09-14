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
 * Fourteenth leftover: validateArguments uses `!(param in args)` — present
 * falsy values (undefined/null/0/false/"") still satisfy required.
 */
describe("base-tool required in-operator falsy-present fourteenth leftover", () => {
	it.each([
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "empty string", value: "" },
	])("required q present as $label still validates", ({ value }) => {
		const tool = new ConfigurableTool(
			{
				name: "req_present",
				description: "Required param present with falsy value",
			},
			{
				name: "req_present",
				parameters: {
					type: Type.OBJECT,
					properties: { q: { type: Type.STRING } },
					required: ["q"],
				},
			},
		);
		expect(tool.validateArguments({ q: value })).toBe(true);
	});

	it("missing key still fails (control)", () => {
		const tool = new ConfigurableTool(
			{
				name: "req_missing",
				description: "Required param missing key fails validation",
			},
			{
				name: "req_missing",
				parameters: {
					type: Type.OBJECT,
					properties: { q: { type: Type.STRING } },
					required: ["q"],
				},
			},
		);
		expect(tool.validateArguments({})).toBe(false);
	});
});
