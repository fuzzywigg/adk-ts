import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";

describe("Event behavior leftover edges", () => {
	describe("isFinalResponse matrix", () => {
		it.each([
			{
				label: "plain text",
				opts: {
					author: "a",
					content: { parts: [{ text: "ok" }] },
				},
				expected: true,
			},
			{
				label: "partial true",
				opts: {
					author: "a",
					partial: true,
					content: { parts: [{ text: "stream" }] },
				},
				expected: false,
			},
			{
				label: "functionCall only",
				opts: {
					author: "a",
					content: { parts: [{ functionCall: { name: "t", args: {} } }] },
				},
				expected: false,
			},
			{
				label: "functionResponse only",
				opts: {
					author: "a",
					content: {
						parts: [{ functionResponse: { name: "t", response: 1 } }],
					},
				},
				expected: false,
			},
			{
				label: "skipSummarization true with calls",
				opts: {
					author: "a",
					actions: new EventActions({ skipSummarization: true }),
					content: { parts: [{ functionCall: { name: "t", args: {} } }] },
				},
				expected: true,
			},
			{
				label: "empty longRunningToolIds Set",
				opts: {
					author: "a",
					longRunningToolIds: new Set<string>(),
					content: { parts: [{ functionCall: { name: "t", args: {} } }] },
				},
				expected: true,
			},
			{
				label: "trailing codeExecutionResult",
				opts: {
					author: "a",
					content: {
						parts: [{ text: "x" }, { codeExecutionResult: { output: "1" } }],
					},
				},
				expected: false,
			},
			{
				label: "empty parts non-partial",
				opts: {
					author: "a",
					content: { parts: [] },
				},
				expected: true,
			},
			{
				label: "no content",
				opts: { author: "a" },
				expected: true,
			},
			{
				label: "skipSummarization false with response",
				opts: {
					author: "a",
					actions: new EventActions({ skipSummarization: false }),
					content: {
						parts: [{ functionResponse: { name: "t", response: {} } }],
					},
				},
				expected: false,
			},
		])("$label => $expected", ({ opts, expected }) => {
			expect(new Event(opts as any).isFinalResponse()).toBe(expected);
		});

		it("skipSummarization wins over partial and trailing code result", () => {
			const event = new Event({
				author: "agent",
				partial: true,
				actions: new EventActions({ skipSummarization: true }),
				content: {
					parts: [
						{ functionCall: { name: "x", args: {} } },
						{ codeExecutionResult: { output: "y" } },
					],
				},
			});
			expect(event.isFinalResponse()).toBe(true);
		});

		it("longRunningToolIds wins over functionResponse and partial", () => {
			const event = new Event({
				author: "agent",
				partial: true,
				longRunningToolIds: new Set(["id-1"]),
				content: {
					parts: [{ functionResponse: { name: "x", response: true } }],
				},
			});
			expect(event.isFinalResponse()).toBe(true);
		});
	});

	describe("getFunctionCalls / getFunctionResponses leftovers", () => {
		it("ignores falsy functionCall / functionResponse fields", () => {
			const event = new Event({
				author: "a",
				content: {
					parts: [
						{ functionCall: null },
						{ functionCall: undefined },
						{ functionResponse: null },
						{ functionResponse: 0 as any },
						{ functionCall: { name: "real", args: { n: 1 } } },
						{ functionResponse: { name: "real", response: "ok" } },
					],
				},
			});
			expect(event.getFunctionCalls()).toEqual([
				{ name: "real", args: { n: 1 } },
			]);
			expect(event.getFunctionResponses()).toEqual([
				{ name: "real", response: "ok" },
			]);
		});

		it("returns empty lists when content is nullish or parts missing", () => {
			expect(
				new Event({ author: "a", content: null as any }).getFunctionCalls(),
			).toEqual([]);
			expect(
				new Event({
					author: "a",
					content: undefined,
				}).getFunctionResponses(),
			).toEqual([]);
			expect(
				new Event({
					author: "a",
					content: { role: "model" },
				}).getFunctionCalls(),
			).toEqual([]);
		});

		it("preserves call/response object identity from parts", () => {
			const call = { name: "c", args: { q: "x" } };
			const response = { name: "c", response: { hits: 2 } };
			const event = new Event({
				author: "a",
				content: {
					parts: [{ functionCall: call }, { functionResponse: response }],
				},
			});
			expect(event.getFunctionCalls()[0]).toBe(call);
			expect(event.getFunctionResponses()[0]).toBe(response);
		});

		it("does not treat nested non-array parts as iterable", () => {
			const event = new Event({
				author: "a",
				content: {
					parts: { functionCall: { name: "nope", args: {} } } as any,
				},
			});
			expect(event.getFunctionCalls()).toEqual([]);
			expect(event.getFunctionResponses()).toEqual([]);
		});
	});

	describe("branching, partial, and constructor leftovers", () => {
		it.each([
			["root"],
			["root.child"],
			["a.b.c.d"],
			[""],
		])("preserves branch value %#: %j", (branch) => {
			const event = new Event({ author: "agent", branch });
			expect(event.branch).toBe(branch);
		});

		it("partial undefined stays undefined and does not block finality", () => {
			const event = new Event({
				author: "agent",
				content: { parts: [{ text: "done" }] },
			});
			expect(event.partial).toBeUndefined();
			expect(event.isFinalResponse()).toBe(true);
		});

		it("partial false is explicit and remains final without tools", () => {
			const event = new Event({
				author: "agent",
				partial: false,
				content: { parts: [{ text: "done" }] },
			});
			expect(event.partial).toBe(false);
			expect(event.isFinalResponse()).toBe(true);
		});

		it("uses provided id/timestamp and still generates newId independently", () => {
			const event = new Event({
				author: "agent",
				id: "abcd1234",
				timestamp: 42,
			});
			expect(event.id).toBe("abcd1234");
			expect(event.timestamp).toBe(42);
			expect(Event.newId()).toMatch(/^[a-f0-9]{8}$/);
			expect(Event.newId()).not.toBe(event.id);
		});

		it("stringifies nested content text for snapshot-style checks", () => {
			const event = new Event({
				author: "agent",
				branch: "root.leaf",
				content: {
					role: "model",
					parts: [{ text: "hello" }, { text: "world" }],
				},
			});
			const snapshot = JSON.stringify({
				author: event.author,
				branch: event.branch,
				texts: event.content?.parts?.map((p: any) => p.text).filter(Boolean),
				final: event.isFinalResponse(),
			});
			expect(snapshot).toBe(
				JSON.stringify({
					author: "agent",
					branch: "root.leaf",
					texts: ["hello", "world"],
					final: true,
				}),
			);
		});

		it("hasTrailingCodeExecutionResult is true only for last part truthy result", () => {
			expect(
				new Event({
					author: "a",
					content: {
						parts: [{ text: "x" }, { codeExecutionResult: { outcome: "OK" } }],
					},
				}).hasTrailingCodeExecutionResult(),
			).toBe(true);
			expect(
				new Event({
					author: "a",
					content: {
						parts: [
							{ codeExecutionResult: { outcome: "OK" } },
							{ functionCall: { name: "after", args: {} } },
						],
					},
				}).hasTrailingCodeExecutionResult(),
			).toBe(false);
		});

		it("default actions instance is unique per event", () => {
			const a = new Event({ author: "a" });
			const b = new Event({ author: "b" });
			expect(a.actions).not.toBe(b.actions);
			expect(a.actions).toBeInstanceOf(EventActions);
		});

		it("invocationId empty string is preserved when provided", () => {
			const event = new Event({ author: "a", invocationId: "" });
			expect(event.invocationId).toBe("");
		});
	});
});
