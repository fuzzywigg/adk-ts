import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import {
	declarationToJsonSchema,
	normalizeJsonSchema,
} from "../../../tools/mcp/schema-conversion";

/**
 * Thirteenth leftover: empty required [] is truthy and kept; empty title is
 * dropped. declarationToJsonSchema `if (!parameters)` vs empty properties.
 */
describe("mcp schema empty required vs title thirteenth leftover", () => {
	it("keeps required: [] and drops empty title on object schemas", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: { a: { type: "string" } },
				required: [],
				title: "",
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: { a: { type: Type.STRING } },
			required: [],
		});
	});

	it("keeps title: 0? no — 0 is falsy and dropped; title '0' kept", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				title: 0 as any,
			}),
		).toEqual({ type: Type.OBJECT, properties: {} });
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				title: "0",
			}),
		).toEqual({ type: Type.OBJECT, properties: {}, title: "0" });
	});

	it("declarationToJsonSchema returns {} when parameters missing/falsy", () => {
		expect(declarationToJsonSchema({ name: "n" } as any)).toEqual({});
		expect(
			declarationToJsonSchema({ name: "n", parameters: null } as any),
		).toEqual({});
		expect(
			declarationToJsonSchema({ name: "n", parameters: 0 } as any),
		).toEqual({});
	});

	it("declarationToJsonSchema returns properties when present else whole parameters", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: { properties: { q: { type: "string" } } },
			} as any),
		).toEqual({ q: { type: "string" } });
		expect(
			declarationToJsonSchema({
				name: "n",
				parameters: { type: "object" },
			} as any),
		).toEqual({ type: "object" });
	});
});
