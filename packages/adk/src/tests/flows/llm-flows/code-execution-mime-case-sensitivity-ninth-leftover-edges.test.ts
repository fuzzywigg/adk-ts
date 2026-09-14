import { describe, expect, it } from "vitest";
import { CodeExecutorContext } from "../../../code-executors/code-executor-context";
import {
	extractAndReplaceInlineFiles,
	getDataFilePreprocessingCode,
} from "../../../flows/llm-flows/code-execution";
import { LlmRequest } from "../../../models/llm-request";
import { State } from "../../../sessions/state";

describe("code-execution mimeType case-sensitivity ninth leftover", () => {
	it.each([
		"TEXT/CSV",
		"Text/Csv",
		"text/CSV",
		"text/csv ",
		" text/csv",
		"application/csv",
		"text/comma-separated-values",
	])("extractAndReplaceInlineFiles skips near-miss mime %j (exact key in map)", (mimeType) => {
		const ctx = new CodeExecutorContext(State.create({}, {}));
		const llmRequest = new LlmRequest({
			contents: [
				{
					role: "user",
					parts: [{ inlineData: { mimeType, data: "a,b\n1,2" } }],
				},
			],
		});
		const files = extractAndReplaceInlineFiles(ctx, llmRequest);
		expect(files).toEqual([]);
		expect(llmRequest.contents?.[0].parts?.[0]).toEqual({
			inlineData: { mimeType, data: "a,b\n1,2" },
		});
	});

	it("exact lowercase text/csv is still promoted", () => {
		const ctx = new CodeExecutorContext(State.create({}, {}));
		const llmRequest = new LlmRequest({
			contents: [
				{
					role: "user",
					parts: [{ inlineData: { mimeType: "text/csv", data: "a,b\n1,2" } }],
				},
			],
		});
		const files = extractAndReplaceInlineFiles(ctx, llmRequest);
		expect(files).toHaveLength(1);
		expect(files[0].mimeType).toBe("text/csv");
		expect(llmRequest.contents?.[0].parts?.[0]?.text).toContain("data_1_1.csv");
	});

	it.each([
		"TEXT/CSV",
		"Text/csv",
		"text/CSV",
		"application/json",
		"",
	])("getDataFilePreprocessingCode returns undefined for %j", (mimeType) => {
		expect(
			getDataFilePreprocessingCode({
				name: "data.csv",
				content: btoa("a"),
				mimeType,
			}),
		).toBeUndefined();
	});

	it("getDataFilePreprocessingCode returns loader for exact text/csv", () => {
		const code = getDataFilePreprocessingCode({
			name: "data.csv",
			content: btoa("a"),
			mimeType: "text/csv",
		});
		expect(code).toContain("pd.read_csv('data.csv')");
		expect(code).toContain("explore_df");
	});
});
