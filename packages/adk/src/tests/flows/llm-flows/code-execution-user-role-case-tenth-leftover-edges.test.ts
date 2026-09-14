import { describe, expect, it } from "vitest";
import { CodeExecutorContext } from "../../../code-executors/code-executor-context";
import { extractAndReplaceInlineFiles } from "../../../flows/llm-flows/code-execution";
import { LlmRequest } from "../../../models/llm-request";
import { State } from "../../../sessions/state";

describe("code-execution extractAndReplaceInlineFiles role !== user case (tenth leftover)", () => {
	it.each([
		"USER",
		"User",
		"model",
		"assistant",
	])("role %j is skipped so csv inlineData is not replaced", (role) => {
		const ctx = new CodeExecutorContext(State.create({}, {}));
		const llmRequest = new LlmRequest({
			contents: [
				{
					role,
					parts: [{ inlineData: { mimeType: "text/csv", data: "a,b\n1,2" } }],
				},
			],
		});
		const files = extractAndReplaceInlineFiles(ctx, llmRequest);
		expect(files).toEqual([]);
		expect(llmRequest.contents?.[0].parts?.[0]).toEqual({
			inlineData: { mimeType: "text/csv", data: "a,b\n1,2" },
		});
	});

	it("exact lowercase user replaces csv inlineData with a file placeholder", () => {
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
		expect(llmRequest.contents?.[0].parts?.[0]?.text).toContain(
			"Available file:",
		);
	});
});
