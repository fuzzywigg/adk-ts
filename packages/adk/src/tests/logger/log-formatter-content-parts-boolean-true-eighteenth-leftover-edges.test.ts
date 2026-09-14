import type { Content, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LogFormatter } from "../../logger/log-formatter";
import { LlmResponse } from "../../models/llm-response";

/**
 * Eighteenth leftover (logger/env residual): LogFormatter boolean `true` for content / parts / text
 * after fifteenth falsy `0`/`false`/`""` and seventeenth string `"0"`/`"false"`.
 * content:true is truthy → formatContentPreview JSON `"true"`; parts:true is
 * truthy non-array → JSON fallback; text:true kept via filter + `"${text}"`.
 */
describe("LogFormatter content/parts/text boolean-true eighteenth leftover", () => {
	it('formatResponsePreview content=true → "true" (truthy vs false→none)', () => {
		expect(
			LogFormatter.formatResponsePreview({
				content: true,
			} as unknown as LlmResponse),
		).toBe("true");
	});

	it("parts: true → JSON fallback (Array.isArray fails; fifteenth had object/string)", () => {
		const content = { role: "user", parts: true } as unknown as Content;
		const result = LogFormatter.formatContentPreview(content);
		expect(result).toBe(JSON.stringify(content));
		expect(result).toContain('"parts":true');
		expect(result).not.toBe("no text content");
		expect(result).not.toBe("none");
	});

	it('formatContentPreview text:true joins as "true"', () => {
		expect(
			LogFormatter.formatContentPreview({
				role: "user",
				parts: [{ text: true as any }],
			}),
		).toBe("true");
	});

	it('formatContentParts text:true → text: "true" (length undefined skips truncate)', () => {
		const lines = LogFormatter.formatContentParts({
			role: "user",
			parts: [{ text: true as any } as Part],
		});
		expect(lines[0]).toBe('[0] text: "true"');
	});

	it("functionCall.args=true JSON.stringifies (truthy boolean; seventeenth had strings)", () => {
		expect(
			LogFormatter.formatFunctionCalls([
				{ functionCall: { name: "fn", args: true as any } } as Part,
			]),
		).toBe("fn(true)");
	});
});
