import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Leftover: Type.OBJECT default branch does not recurse into properties, so
 * nested lowercase types and nested additionalProperties stay as provided.
 * Lowercase "object" recurses via normalizeObjectSchema and rewrites children.
 */
describe("schema-conversion Type-enum nested recursion trap leftover edges", () => {
	it("Type.OBJECT keeps nested lowercase types and nested additionalProperties", () => {
		expect(
			normalizeJsonSchema({
				type: Type.OBJECT,
				properties: {
					a: { type: "string", minLength: 1 },
					b: {
						type: "object",
						properties: { c: { type: "number" } },
						additionalProperties: true,
					},
				},
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {
				a: { type: "string", minLength: 1 },
				b: {
					type: "object",
					properties: { c: { type: "number" } },
					additionalProperties: true,
				},
			},
		});
	});

	it('lowercase "object" rewrites nested types and strips nested additionalProperties', () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {
					a: { type: "string", minLength: 1 },
					b: {
						type: "object",
						properties: { c: { type: "number" } },
						additionalProperties: true,
					},
				},
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {
				a: { type: Type.STRING, minLength: 1 },
				b: {
					type: Type.OBJECT,
					properties: { c: { type: "number" } },
				},
			},
		});
	});

	it("inferred object from properties alone also skips nested recursion", () => {
		expect(
			normalizeJsonSchema({
				properties: {
					nested: {
						type: "object",
						additionalProperties: false,
						properties: { k: { type: "boolean", title: "k" } },
					},
				},
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {
				nested: {
					type: "object",
					additionalProperties: false,
					properties: { k: { type: "boolean", title: "k" } },
				},
			},
		});
	});

	it("Type.OBJECT with already-enum nested children passes them through", () => {
		expect(
			normalizeJsonSchema({
				type: Type.OBJECT,
				properties: {
					n: {
						type: Type.OBJECT,
						properties: { k: { type: Type.STRING, minLength: 1 } },
						required: ["k"],
						additionalProperties: true,
					},
				},
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {
				n: {
					type: Type.OBJECT,
					properties: { k: { type: Type.STRING, minLength: 1 } },
					required: ["k"],
					additionalProperties: true,
				},
			},
		});
	});

	it('lowercase "object" recurses into Type.OBJECT children via default branch', () => {
		// Parent lowercase triggers normalizeObjectSchema which calls
		// normalizeJsonSchema on each child; Type.OBJECT child then hits default.
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {
					n: {
						type: Type.OBJECT,
						properties: { k: { type: Type.STRING } },
						additionalProperties: true,
					},
				},
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {
				n: {
					type: Type.OBJECT,
					properties: { k: { type: Type.STRING } },
					additionalProperties: true,
				},
			},
		});
	});
});
