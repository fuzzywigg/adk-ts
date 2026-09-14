import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";

/**
 * Fourteenth leftover: contents ?? [] and toolsDict ?? {} keep falsy
 * non-nullish values (unlike || which would replace them).
 */
describe("llm-request ctor nullish vs falsy contents fourteenth leftover edges", () => {
	it.each([
		{ label: "empty string", value: "" },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
	])("contents $label survives ?? (not replaced by [])", ({ value }) => {
		const req = new LlmRequest({ contents: value as any });
		expect(req.contents).toBe(value);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "undefined", value: undefined },
	])("contents $label → []", ({ value }) => {
		const req = new LlmRequest({ contents: value as any });
		expect(req.contents).toEqual([]);
	});

	it.each([
		{ label: "empty string", value: "" },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
	])("toolsDict $label survives ?? (not replaced by {})", ({ value }) => {
		const req = new LlmRequest({ toolsDict: value as any });
		expect(req.toolsDict).toBe(value);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "undefined", value: undefined },
	])("toolsDict $label → {}", ({ value }) => {
		const req = new LlmRequest({ toolsDict: value as any });
		expect(req.toolsDict).toEqual({});
	});
});
