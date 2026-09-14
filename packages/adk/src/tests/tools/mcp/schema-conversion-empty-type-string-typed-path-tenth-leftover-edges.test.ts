import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import {
	jsonSchemaToDeclaration,
	normalizeJsonSchema,
} from "../../../tools/mcp/schema-conversion";

/**
 * Tenth leftover: jsonSchemaToDeclaration treats any string `type` as typed,
 * including empty string — it is NOT wrapped. normalizeJsonSchema then
 * treats "" as falsy and infers OBJECT.
 */
describe("schema-conversion empty-string type typed-path tenth leftover edges", () => {
	it('jsonSchemaToDeclaration keeps { type: "" } as-is (string type, not wrap)', () => {
		expect(
			jsonSchemaToDeclaration("n", "d", { type: "" } as any).parameters,
		).toEqual({ type: "" });
	});

	it("jsonSchemaToDeclaration wraps when type is missing (control)", () => {
		expect(
			jsonSchemaToDeclaration("n", "d", { a: 1 } as any).parameters,
		).toEqual({
			type: Type.OBJECT,
			properties: { a: 1 },
		});
	});

	it('normalizeJsonSchema infers OBJECT when type is ""', () => {
		expect(normalizeJsonSchema({ type: "" } as any)).toEqual({
			type: Type.OBJECT,
		});
	});

	it("inferred Type.ARRAY from empty type + items hits default (does not recurse items)", () => {
		expect(
			normalizeJsonSchema({
				type: "",
				items: { type: "string" },
			} as any),
		).toEqual({
			type: Type.ARRAY,
			items: { type: "string" },
		});
	});

	it('whitespace type " " is truthy so skip infer and hit default branch', () => {
		expect(normalizeJsonSchema({ type: " " } as any)).toEqual({ type: " " });
	});
});
