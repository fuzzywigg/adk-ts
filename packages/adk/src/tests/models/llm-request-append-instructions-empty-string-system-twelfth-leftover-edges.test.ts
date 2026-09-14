import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";

/**
 * Twelfth leftover: appendInstructions uses `if (this.config.systemInstruction)`
 * so `""` is treated as unset (replace), while `" "` is truthy (append).
 */
describe("llm-request appendInstructions empty-string system twelfth leftover edges", () => {
	it("empty-string systemInstruction is replaced, not concatenated", () => {
		const req = new LlmRequest({
			config: { systemInstruction: "" },
		});
		req.appendInstructions(["next"]);
		expect(req.config?.systemInstruction).toBe("next");
	});

	it("whitespace-only systemInstruction is truthy so it concatenates", () => {
		const req = new LlmRequest({
			config: { systemInstruction: " " },
		});
		req.appendInstructions(["next"]);
		expect(req.config?.systemInstruction).toBe(" \n\nnext");
	});

	it.each([
		{ label: "0", value: 0, expected: "a" },
		{ label: "false", value: false, expected: "a" },
		{ label: "null", value: null, expected: "a" },
	])("$label systemInstruction is falsy → replace path", ({
		value,
		expected,
	}) => {
		const req = new LlmRequest();
		req.config = { systemInstruction: value as any };
		req.appendInstructions(["a"]);
		expect(req.config.systemInstruction).toBe(expected);
	});

	it('string "0" is truthy so it concatenates', () => {
		const req = new LlmRequest({
			config: { systemInstruction: "0" },
		});
		req.appendInstructions(["a"]);
		expect(req.config?.systemInstruction).toBe("0\n\na");
	});
});
