import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";

type ContentShape =
	| undefined
	| null
	| Record<string, unknown>
	| { parts: unknown };

describe("Event fourth leftover — isFinalResponse / getFunction* / trailing matrices", () => {
	const contentShapes: Array<{
		label: string;
		content: ContentShape;
		calls: number;
		responses: number;
		trailing: boolean;
		plainFinal: boolean;
	}> = [
		{
			label: "undefined content",
			content: undefined,
			calls: 0,
			responses: 0,
			trailing: false,
			plainFinal: true,
		},
		{
			label: "null content",
			content: null,
			calls: 0,
			responses: 0,
			trailing: false,
			plainFinal: true,
		},
		{
			label: "empty object",
			content: {},
			calls: 0,
			responses: 0,
			trailing: false,
			plainFinal: true,
		},
		{
			label: "parts undefined",
			content: { parts: undefined },
			calls: 0,
			responses: 0,
			trailing: false,
			plainFinal: true,
		},
		{
			label: "parts null",
			content: { parts: null },
			calls: 0,
			responses: 0,
			trailing: false,
			plainFinal: true,
		},
		{
			label: "parts empty array",
			content: { parts: [] },
			calls: 0,
			responses: 0,
			trailing: false,
			plainFinal: true,
		},
		{
			label: "parts non-array string",
			content: { parts: "not-array" },
			calls: 0,
			responses: 0,
			trailing: false,
			plainFinal: true,
		},
		{
			label: "text only",
			content: { parts: [{ text: "hello" }] },
			calls: 0,
			responses: 0,
			trailing: false,
			plainFinal: true,
		},
		{
			label: "functionCall only",
			content: { parts: [{ functionCall: { name: "t", args: {} } }] },
			calls: 1,
			responses: 0,
			trailing: false,
			plainFinal: false,
		},
		{
			label: "functionResponse only",
			content: {
				parts: [{ functionResponse: { name: "t", response: { ok: 1 } } }],
			},
			calls: 0,
			responses: 1,
			trailing: false,
			plainFinal: false,
		},
		{
			label: "mixed call + response",
			content: {
				parts: [
					{ functionCall: { name: "a", args: { x: 1 } } },
					{ functionResponse: { name: "a", response: { ok: true } } },
				],
			},
			calls: 1,
			responses: 1,
			trailing: false,
			plainFinal: false,
		},
		{
			label: "trailing codeExecutionResult",
			content: {
				parts: [
					{ text: "ran" },
					{ codeExecutionResult: { outcome: "OK", output: "1" } },
				],
			},
			calls: 0,
			responses: 0,
			trailing: true,
			plainFinal: false,
		},
		{
			label: "non-trailing codeExecutionResult",
			content: {
				parts: [{ codeExecutionResult: { outcome: "OK" } }, { text: "after" }],
			},
			calls: 0,
			responses: 0,
			trailing: false,
			plainFinal: true,
		},
		{
			label: "mixed text + call + response + mid code result",
			content: {
				parts: [
					{ text: "intro" },
					{ functionCall: { name: "a", args: {} } },
					{ codeExecutionResult: { outcome: "OK" } },
					{ functionResponse: { name: "a", response: {} } },
					{ text: "outro" },
				],
			},
			calls: 1,
			responses: 1,
			trailing: false,
			plainFinal: false,
		},
		{
			label: "last part codeExecutionResult null",
			content: {
				parts: [{ text: "x" }, { codeExecutionResult: null }],
			},
			calls: 0,
			responses: 0,
			trailing: false,
			plainFinal: true,
		},
		{
			label: "last part codeExecutionResult undefined",
			content: {
				parts: [{ text: "x" }, { codeExecutionResult: undefined }],
			},
			calls: 0,
			responses: 0,
			trailing: false,
			plainFinal: true,
		},
		{
			label: "two functionCalls",
			content: {
				parts: [
					{ functionCall: { name: "a", args: { n: 1 } } },
					{ text: "mid" },
					{ functionCall: { name: "b", args: {} } },
				],
			},
			calls: 2,
			responses: 0,
			trailing: false,
			plainFinal: false,
		},
		{
			label: "two functionResponses",
			content: {
				parts: [
					{ functionResponse: { name: "a", response: 1 } },
					{ functionResponse: { name: "b", response: 2 } },
				],
			},
			calls: 0,
			responses: 2,
			trailing: false,
			plainFinal: false,
		},
	];

	const skipValues: Array<{
		label: string;
		skip: boolean | undefined;
		forcesFinal: boolean;
	}> = [
		{ label: "skip undefined", skip: undefined, forcesFinal: false },
		{ label: "skip false", skip: false, forcesFinal: false },
		{ label: "skip true", skip: true, forcesFinal: true },
	];

	const longRunningValues: Array<{
		label: string;
		ids: Set<string> | undefined;
		forcesFinal: boolean;
	}> = [
		{ label: "lr undefined", ids: undefined, forcesFinal: false },
		{ label: "lr empty set", ids: new Set(), forcesFinal: true },
		{ label: "lr with ids", ids: new Set(["lr-1"]), forcesFinal: true },
	];

	for (const shape of contentShapes) {
		it(`collections for ${shape.label}`, () => {
			const event = new Event({
				author: "agent",
				content: shape.content as any,
			});
			expect(event.getFunctionCalls()).toHaveLength(shape.calls);
			expect(event.getFunctionResponses()).toHaveLength(shape.responses);
			expect(event.hasTrailingCodeExecutionResult()).toBe(shape.trailing);
			expect(event.isFinalResponse()).toBe(shape.plainFinal);
		});
	}

	for (const skip of skipValues) {
		for (const lr of longRunningValues) {
			it(`finality matrix: ${skip.label} × ${lr.label} with functionCall`, () => {
				const event = new Event({
					author: "agent",
					actions: new EventActions({ skipSummarization: skip.skip }),
					longRunningToolIds: lr.ids,
					content: {
						parts: [{ functionCall: { name: "tool", args: {} } }],
					},
				});
				const expected = skip.forcesFinal || lr.forcesFinal;
				expect(event.isFinalResponse()).toBe(expected);
			});
		}
	}

	for (const skip of skipValues) {
		it(`skipSummarization=${String(skip.skip)} with trailing code result`, () => {
			const event = new Event({
				author: "agent",
				actions: new EventActions({ skipSummarization: skip.skip }),
				content: {
					parts: [
						{ text: "x" },
						{ codeExecutionResult: { outcome: "OK", output: "1" } },
					],
				},
			});
			expect(event.hasTrailingCodeExecutionResult()).toBe(true);
			expect(event.isFinalResponse()).toBe(skip.forcesFinal);
		});
	}

	it("partial true blocks final for plain text unless skip/lr short-circuit", () => {
		const base = new Event({
			author: "agent",
			partial: true,
			content: { parts: [{ text: "stream" }] },
		});
		expect(base.isFinalResponse()).toBe(false);

		const skipped = new Event({
			author: "agent",
			partial: true,
			actions: new EventActions({ skipSummarization: true }),
			content: { parts: [{ text: "stream" }] },
		});
		expect(skipped.isFinalResponse()).toBe(true);

		const lr = new Event({
			author: "agent",
			partial: true,
			longRunningToolIds: new Set(["x"]),
			content: { parts: [{ text: "stream" }] },
		});
		expect(lr.isFinalResponse()).toBe(true);
	});

	it("empty Set longRunningToolIds wins over skipSummarization false", () => {
		const event = new Event({
			author: "agent",
			actions: new EventActions({ skipSummarization: false }),
			longRunningToolIds: new Set(),
			content: {
				parts: [{ functionCall: { name: "pending", args: {} } }],
			},
		});
		expect(event.isFinalResponse()).toBe(true);
	});
});
