import type { FunctionCall, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";
import { LlmResponse } from "../../models/llm-response";
import { VERSION } from "../../version";

describe("LogFormatter version heavy matrix leftover edges", () => {
	it("formatFunctionCalls returns none for empty/nullish inputs", () => {
		expect(LogFormatter.formatFunctionCalls([])).toBe("none");
		expect(LogFormatter.formatFunctionCalls(null as any)).toBe("none");
		expect(LogFormatter.formatFunctionCalls(undefined as any)).toBe("none");
	});

	it("does not ellipsize args JSON of exactly 50 chars", () => {
		const args = { x: "a".repeat(42) };
		expect(JSON.stringify(args).length).toBe(50);
		const result = LogFormatter.formatFunctionCalls([
			{ functionCall: { name: "exact", args } as FunctionCall },
		]);
		expect(result).toBe(`exact(${JSON.stringify(args)})`);
		expect(result).not.toContain("...");
	});

	it("ellipsizes args JSON longer than 50 chars", () => {
		const args = { x: "a".repeat(43) };
		expect(JSON.stringify(args).length).toBeGreaterThan(50);
		const result = LogFormatter.formatFunctionCalls([
			{ functionCall: { name: "over", args } as FunctionCall },
		]);
		expect(result).toContain("...");
		expect(result.startsWith("over(")).toBe(true);
	});

	it("formats function calls without args as empty object", () => {
		expect(
			LogFormatter.formatFunctionCalls([
				{ functionCall: { name: "no_args" } as FunctionCall },
			]),
		).toBe("no_args({})");
	});

	it("joins multiple function calls with commas", () => {
		const parts: Part[] = [
			{ functionCall: { name: "a", args: { x: 1 } } as FunctionCall },
			{ functionCall: { name: "b", args: { y: 2 } } as FunctionCall },
		];
		const result = LogFormatter.formatFunctionCalls(parts);
		expect(result).toContain("a(");
		expect(result).toContain("b(");
		expect(result).toContain(",");
	});

	it("formatContentPreview summarizes text parts and truncates long text", () => {
		expect(
			LogFormatter.formatContentPreview({
				role: "model",
				parts: [{ text: "hello world" }],
			}),
		).toContain("hello world");
		const long = "x".repeat(100);
		expect(
			LogFormatter.formatContentPreview({
				role: "model",
				parts: [{ text: long }],
			}),
		).toContain("...");
	});

	it("formatContentPreview handles missing content and empty parts", () => {
		expect(LogFormatter.formatContentPreview(undefined as any)).toBe("none");
		expect(LogFormatter.formatContentPreview({ role: "user", parts: [] })).toBe(
			"no text content",
		);
	});

	it("formatResponsePreview reads llm response content", () => {
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: "answer" }] },
		});
		expect(LogFormatter.formatResponsePreview(response)).toContain("answer");
		expect(LogFormatter.formatResponsePreview(new LlmResponse())).toBe("none");
	});

	it("formatSingleFunctionCall pretty-prints args", () => {
		const formatted = LogFormatter.formatSingleFunctionCall({
			name: "search",
			args: { q: "adk" },
		} as FunctionCall);
		expect(formatted).toContain("search(");
		expect(formatted).toContain('"q"');
	});

	it("formatFunctionResponse formats response payloads", () => {
		expect(
			LogFormatter.formatFunctionResponse({
				functionResponse: { name: "search", response: { ok: true } },
			}),
		).toContain("search ->");
		expect(LogFormatter.formatFunctionResponse({ text: "x" })).toBe("none");
	});

	it("formatContentParts labels each part", () => {
		const parts = LogFormatter.formatContentParts({
			role: "model",
			parts: [{ text: "hi" }, { functionCall: { name: "t", args: {} } }],
		});
		expect(parts[0]).toContain("[0]");
		expect(parts[1]).toContain("[1]");
		expect(LogFormatter.formatContentParts({ role: "user" } as any)).toEqual([
			"no parts",
		]);
	});
});

describe("VERSION heavy matrix leftover edges", () => {
	it("exports a non-empty semver-like string", () => {
		expect(typeof VERSION).toBe("string");
		expect(VERSION.length).toBeGreaterThan(0);
		expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
	});

	it("matches major.minor.patch with optional prerelease", () => {
		expect(VERSION).toMatch(/^\d+\.\d+\.\d+([.-].+)?$/);
	});
});
