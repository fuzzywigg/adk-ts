import { describe, expect, it } from "vitest";
import { CodeExecutorContext } from "../../../code-executors/code-executor-context";
import { extractAndReplaceInlineFiles } from "../../../flows/llm-flows/code-execution";
import { LlmRequest } from "../../../models/llm-request";
import { State } from "../../../sessions/state";

/**
 * Tenth leftover: `content.role !== "user"` is case-sensitive — `User`/`USER`
 * skip data-file ingest. Orthogonal to #176 mime-key case slice.
 */
describe("code-execution user role case-sensitivity tenth leftover (post #176)", () => {
	it.each([
		"User",
		"USER",
		"user ",
		"User\t",
		"assistant",
		"model",
	] as const)("role %j !== exact user → inline csv not promoted", (role) => {
		const ctx = new CodeExecutorContext(State.create({}, {}));
		const llmRequest = new LlmRequest({
			contents: [
				{
					role: role as any,
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

	it('exact role "user" still promotes text/csv (control)', () => {
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
		expect(files[0].name).toBe("data_1_1.csv");
		expect(llmRequest.contents?.[0].parts?.[0]?.text).toContain(
			"Available file:",
		);
	});

	it("mixed User then user: only the exact-user content is ingested", () => {
		const ctx = new CodeExecutorContext(State.create({}, {}));
		const llmRequest = new LlmRequest({
			contents: [
				{
					role: "User" as any,
					parts: [
						{ inlineData: { mimeType: "text/csv", data: "skip,me\n0,0" } },
					],
				},
				{
					role: "user",
					parts: [
						{ inlineData: { mimeType: "text/csv", data: "keep,me\n1,1" } },
					],
				},
			],
		});
		const files = extractAndReplaceInlineFiles(ctx, llmRequest);
		expect(files).toHaveLength(1);
		expect(files[0].name).toBe("data_2_1.csv");
		expect(llmRequest.contents?.[0].parts?.[0]).toEqual({
			inlineData: { mimeType: "text/csv", data: "skip,me\n0,0" },
		});
		expect(llmRequest.contents?.[1].parts?.[0]?.text).toContain("data_2_1.csv");
	});
});
