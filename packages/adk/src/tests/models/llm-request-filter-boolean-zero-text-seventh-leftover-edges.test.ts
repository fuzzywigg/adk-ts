import { beforeEach, describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";

describe("LlmRequest filter(Boolean) zero-text seventh leftover (post #160)", () => {
	let req: LlmRequest;

	beforeEach(() => {
		req = new LlmRequest();
	});

	it('getSystemInstructionText keeps truthy "0" while dropping empty strings', () => {
		req.config = {
			systemInstruction: {
				parts: [
					{ text: "0" },
					{ text: "" },
					{ text: "0" },
					{},
					{ text: false as any },
					{ text: 0 as any },
				],
			} as any,
		};

		expect(req.getSystemInstructionText()).toBe("00");
	});

	it('getSystemInstructionText keeps whitespace-only and "false" strings', () => {
		req.config = {
			systemInstruction: {
				parts: [
					{ text: " " },
					{ text: "false" },
					{ text: "null" },
					{ text: "" },
				],
			} as any,
		};

		expect(req.getSystemInstructionText()).toBe(" falsenull");
	});

	it('extractTextFromContent keeps "0" in Content.parts', () => {
		expect(
			LlmRequest.extractTextFromContent({
				parts: [{ text: "0" }, { text: "" }, { text: "x" }, { text: "0" }],
			}),
		).toBe("0x0");
	});

	it('extractTextFromContent keeps "0" in array-of-parts form', () => {
		expect(
			LlmRequest.extractTextFromContent([
				{ text: "0" },
				{ text: "" },
				{ functionCall: { name: "x" } },
				{ text: "0" },
			]),
		).toBe("00");
	});

	it('part.text || "" turns numeric 0 into "" then filter drops it', () => {
		expect(
			LlmRequest.extractTextFromContent({
				parts: [{ text: 0 as any }, { text: "keep" }, { text: false as any }],
			}),
		).toBe("keep");
	});

	it('NaN and undefined text coerce via || "" then drop', () => {
		expect(
			LlmRequest.extractTextFromContent({
				parts: [
					{ text: Number.NaN as any },
					{ text: undefined },
					{ text: "ok" },
				],
			}),
		).toBe("ok");
	});
});
