import { describe, expect, it } from "vitest";
import { Type } from "@google/genai";
import {
	jsonSchemaToDeclaration,
	normalizeJsonSchema,
} from "../../../tools/mcp/schema-conversion";

/**
 * Fourteenth leftover: jsonSchemaToDeclaration only treats schema as full
 * JSONSchema when `typeof schema.type === "string"`. Numeric Type enum values
 * (if ever passed) wrap as properties bag instead.
 */
describe("mcp jsonschema type nonstring wrap fourteenth leftover", () => {
	it("numeric type field wraps schema as properties (not typed path)", () => {
		const decl = jsonSchemaToDeclaration("t", "d", {
			type: 1 as any,
			properties: { a: { type: "string" } },
		});
		expect(decl.parameters).toEqual({
			type: Type.OBJECT,
			properties: {
				type: 1,
				properties: { a: { type: "string" } },
			},
		});
	});

	it('string type "object" still uses typed path (control)', () => {
		const decl = jsonSchemaToDeclaration("t", "d", {
			type: "object",
			properties: { a: { type: "string" } },
		});
		expect(decl.parameters).toEqual({
			type: "object",
			properties: { a: { type: "string" } },
		});
	});

	it("normalizeJsonSchema with boolean type true hits default passthrough", () => {
		expect(normalizeJsonSchema({ type: true as any, title: "x" })).toEqual({
			type: true,
			title: "x",
		});
	});
});
