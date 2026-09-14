import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Leftover: lowercase "boolean"/"null" normalizers return a bare { type }
 * object, dropping title/description. Type.BOOLEAN / Type.NULL hit default
 * and pass the shallow copy through unchanged.
 */
describe("schema-conversion Type-enum boolean/null passthrough leftover edges", () => {
	const enumScalarCases: Array<{
		label: string;
		type: any;
		extra: Record<string, unknown>;
	}> = [
		{
			label: "Type.BOOLEAN",
			type: Type.BOOLEAN,
			extra: { title: "flag", description: "on/off" },
		},
		{
			label: "BOOLEAN string",
			type: "BOOLEAN",
			extra: { title: "flag", description: "on/off" },
		},
		{
			label: "Type.NULL",
			type: Type.NULL,
			extra: { title: "empty", description: "nullish" },
		},
		{
			label: "NULL string",
			type: "NULL",
			extra: { title: "empty", description: "nullish" },
		},
	];

	for (const { label, type, extra } of enumScalarCases) {
		it(`${label} preserves title/description via default branch`, () => {
			expect(
				normalizeJsonSchema({
					type,
					...extra,
				}),
			).toEqual({ type, ...extra });
		});
	}

	it('lowercase "boolean" drops title/description', () => {
		expect(
			normalizeJsonSchema({
				type: "boolean",
				title: "flag",
				description: "on/off",
			}),
		).toEqual({ type: Type.BOOLEAN });
	});

	it('lowercase "null" drops title/description', () => {
		expect(
			normalizeJsonSchema({
				type: "null",
				title: "empty",
				description: "nullish",
			}),
		).toEqual({ type: Type.NULL });
	});

	it("mixed-case Boolean/Null hit default and keep extras", () => {
		expect(normalizeJsonSchema({ type: "Boolean", title: "b" })).toEqual({
			type: "Boolean",
			title: "b",
		});
		expect(normalizeJsonSchema({ type: "Null", title: "n" })).toEqual({
			type: "Null",
			title: "n",
		});
	});
});
