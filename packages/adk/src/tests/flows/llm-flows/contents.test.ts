import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { EventActions } from "../../../events/event-actions";
import { requestProcessor } from "../../../flows/llm-flows/contents";
import { REQUEST_EUC_FUNCTION_CALL_NAME } from "../../../flows/llm-flows/functions";
import { LlmRequest } from "../../../models/llm-request";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events expected */
	}
}

function userEvent(
	text: string,
	opts: Partial<{
		branch: string;
		invocationId: string;
		timestamp: number;
	}> = {},
): Event {
	return new Event({
		author: "user",
		content: { role: "user", parts: [{ text }] },
		branch: opts.branch,
		invocationId: opts.invocationId,
		timestamp: opts.timestamp,
	});
}

function agentEvent(
	author: string,
	text: string,
	opts: Partial<{
		branch: string;
		invocationId: string;
		timestamp: number;
	}> = {},
): Event {
	return new Event({
		author,
		content: { role: "model", parts: [{ text }] },
		branch: opts.branch,
		invocationId: opts.invocationId,
		timestamp: opts.timestamp,
	});
}

function duckAgent(
	name: string,
	includeContents: "default" | "none",
): {
	name: string;
	canonicalModel: string;
	includeContents: "default" | "none";
} {
	return {
		name,
		canonicalModel: "gpt-4o",
		includeContents,
	};
}

function ctx(
	agent: object,
	events: Event[],
	branch?: string,
): InvocationContext {
	return {
		agent,
		branch,
		session: { events },
		runConfig: {},
	} as unknown as InvocationContext;
}

describe("contents requestProcessor", () => {
	it("skips agents without canonicalModel", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx({ name: "plain" }, [userEvent("hi")]),
				llmRequest,
			),
		);
		expect(llmRequest.contents).toEqual([]);
	});

	it('builds full history when includeContents is "default"', async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("first"),
			agentEvent("assistant", "ack"),
			userEvent("second"),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toHaveLength(3);
		expect(llmRequest.contents[0].parts?.[0]).toEqual({ text: "first" });
		expect(llmRequest.contents[2].parts?.[0]).toEqual({ text: "second" });
	});

	it('leaves contents untouched when includeContents is "none"', async () => {
		const llmRequest = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "preset" }] }],
		});
		const events = [userEvent("ignored history"), userEvent("current")];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "none"), events),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toEqual([
			{ role: "user", parts: [{ text: "preset" }] },
		]);
	});

	it("builds current-turn contents for other includeContents values", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("older", { invocationId: "inv-1", timestamp: 1 }),
			agentEvent("assistant", "older-reply", {
				invocationId: "inv-1",
				timestamp: 2,
			}),
			userEvent("latest", { invocationId: "inv-2", timestamp: 3 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(
					{
						name: "assistant",
						canonicalModel: "gpt-4o",
						includeContents: "current_turn",
					},
					events,
				),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.map((c) => c.parts?.[0]?.text);
		expect(texts).toContain("latest");
		expect(texts).not.toContain("older");
	});

	it("skips empty and state-only events", async () => {
		const llmRequest = new LlmRequest();
		const emptyParts = new Event({
			author: "user",
			content: { role: "user", parts: [] },
		});
		const noRole = new Event({
			author: "user",
			content: { parts: [{ text: "orphan" }] },
		});
		const nonTextPart = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [{ inlineData: { mimeType: "image/png" } }],
			},
		});
		const events = [emptyParts, noRole, nonTextPart, userEvent("kept")];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toHaveLength(1);
		expect(llmRequest.contents[0].parts?.[0]).toEqual({ text: "kept" });
	});

	it("skips auth request credential events", async () => {
		const llmRequest = new LlmRequest();
		const authCall = new Event({
			author: "assistant",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: {},
						},
					},
				],
			},
		});
		const authResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: { ok: true },
						},
					},
				],
			},
		});

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [
					userEvent("before"),
					authCall,
					authResponse,
					userEvent("after"),
				]),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toHaveLength(2);
		expect(llmRequest.contents.map((c) => c.parts?.[0])).toEqual([
			{ text: "before" },
			{ text: "after" },
		]);
	});

	it('rewrites foreign-agent replies with "For context:" prefix', async () => {
		const llmRequest = new LlmRequest();
		const foreign = new Event({
			author: "other-agent",
			content: {
				role: "model",
				parts: [
					{ text: "prior answer" },
					{
						functionCall: {
							id: "fc1",
							name: "lookup",
							args: { q: "x" },
						},
					},
					{
						functionResponse: {
							id: "fc1",
							name: "lookup",
							response: { value: 1 },
						},
					},
				],
			},
		});

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [
					foreign,
					userEvent("continue"),
				]),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toHaveLength(2);
		const rewritten = llmRequest.contents[0];
		expect(rewritten.role).toBe("user");
		expect(rewritten.parts?.[0]).toEqual({ text: "For context:" });
		expect(rewritten.parts?.[1]).toEqual({
			text: "[other-agent] said: prior answer",
		});
		expect(rewritten.parts?.[2]?.text).toContain(
			"[other-agent] called tool `lookup`",
		);
		expect(rewritten.parts?.[3]?.text).toContain(
			"[other-agent] `lookup` tool returned result:",
		);
	});

	it("filters events that do not belong to the current branch", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("root", { branch: "root" }),
			userEvent("peer", { branch: "root.peer" }),
			userEvent("child", { branch: "root.child" }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events, "root.child"),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toHaveLength(2);
		expect(llmRequest.contents.map((c) => c.parts?.[0])).toEqual([
			{ text: "root" },
			{ text: "child" },
		]);
	});

	it("replaces compacted ranges with synthesized model content", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("old-1", { timestamp: 1 }),
			agentEvent("assistant", "old-2", { timestamp: 2 }),
			new Event({
				author: "assistant",
				timestamp: 3,
				content: {
					role: "model",
					parts: [{ text: "compaction-marker" }],
				},
				actions: new EventActions({
					compaction: {
						startTimestamp: 1,
						endTimestamp: 2.5,
						compactedContent: {
							role: "model",
							parts: [{ text: "summary of old turns" }],
						},
					},
				}),
			}),
			userEvent("new", { timestamp: 4 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		expect(llmRequest.contents.map((c) => c.parts?.[0])).toEqual([
			{ text: "summary of old turns" },
			{ text: "new" },
		]);
	});

	it("applies rewindBeforeInvocationId filtering", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("keep-a", { invocationId: "inv-a", timestamp: 1 }),
			agentEvent("assistant", "keep-b", {
				invocationId: "inv-a",
				timestamp: 2,
			}),
			userEvent("discarded", { invocationId: "inv-b", timestamp: 3 }),
			new Event({
				author: "user",
				invocationId: "inv-rewind",
				timestamp: 4,
				content: { role: "user", parts: [{ text: "rewind-marker" }] },
				actions: new EventActions({
					rewindBeforeInvocationId: "inv-b",
				}),
			}),
			userEvent("after-rewind", { invocationId: "inv-c", timestamp: 5 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.map((c) => c.parts?.[0]?.text);
		expect(texts).toContain("keep-a");
		expect(texts).toContain("keep-b");
		expect(texts).toContain("after-rewind");
		expect(texts).not.toContain("discarded");
		expect(texts).not.toContain("rewind-marker");
	});

	it("strips intermediate history when latest functionResponse is async", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("before"),
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "call-async",
								name: "slow_tool",
								args: { q: 1 },
							},
						},
					],
				},
			}),
			agentEvent("assistant", "intermediate chatter"),
			userEvent("unrelated user turn"),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "call-async",
								name: "slow_tool",
								response: { ok: true },
							},
						},
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.flatMap(
			(c) => c.parts?.map((p) => p.text).filter(Boolean) ?? [],
		);
		expect(texts).toContain("before");
		expect(texts).not.toContain("intermediate chatter");
		expect(texts).not.toContain("unrelated user turn");
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => p.functionCall?.id === "call-async"),
			),
		).toBe(true);
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => p.functionResponse?.id === "call-async"),
			),
		).toBe(true);
	});

	it("merges multiple async functionResponses for one functionCall", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "c1",
								name: "tool_a",
								args: {},
							},
						},
						{
							functionCall: {
								id: "c2",
								name: "tool_b",
								args: {},
							},
						},
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c1",
								name: "tool_a",
								response: { a: 1 },
							},
						},
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c2",
								name: "tool_b",
								response: { b: 2 },
							},
						},
					],
				},
			}),
			userEvent("after tools"),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const merged = llmRequest.contents.find((c) =>
			c.parts?.some((p) => p.functionResponse),
		);
		expect(merged?.parts?.map((p) => p.functionResponse?.id)).toEqual([
			"c1",
			"c2",
		]);
		expect(llmRequest.contents.at(-1)?.parts?.[0]).toEqual({
			text: "after tools",
		});
	});

	it("keeps functionCalls that have no matching functionResponse", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "orphan",
								name: "pending_tool",
								args: { x: 1 },
							},
						},
					],
				},
			}),
			userEvent("continue"),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toHaveLength(2);
		expect(llmRequest.contents[0].parts?.[0]?.functionCall).toEqual({
			id: "orphan",
			name: "pending_tool",
			args: { x: 1 },
		});
		expect(llmRequest.contents[1].parts?.[0]).toEqual({ text: "continue" });
	});

	it("strips client-generated adk- function call ids from contents", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "adk-client-1",
								name: "lookup",
								args: {},
							},
						},
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "adk-client-1",
								name: "lookup",
								response: { ok: true },
							},
						},
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		expect(llmRequest.contents[0].parts?.[0]?.functionCall?.id).toBeUndefined();
		expect(
			llmRequest.contents[1].parts?.[0]?.functionResponse?.id,
		).toBeUndefined();
	});

	it("preserves adjacent matched functionCall/functionResponse pairs", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("ask"),
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "sync-1",
								name: "lookup",
								args: { q: "x" },
							},
						},
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "sync-1",
								name: "lookup",
								response: { value: 9 },
							},
						},
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toHaveLength(3);
		expect(llmRequest.contents[1].parts?.[0]?.functionCall?.id).toBe("sync-1");
		expect(llmRequest.contents[2].parts?.[0]?.functionResponse?.id).toBe(
			"sync-1",
		);
	});

	it("passes through malformed events lacking function helpers during rearrange", async () => {
		const llmRequest = new LlmRequest();
		const malformed = {
			author: "assistant",
			timestamp: 10,
			content: {
				role: "model",
				parts: [{ text: "malformed-ok" }],
			},
		} as unknown as Event;

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [
					userEvent("before", { timestamp: 1 }),
					malformed,
					userEvent("after", { timestamp: 20 }),
				]),
				llmRequest,
			),
		);

		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"before",
			"malformed-ok",
			"after",
		]);
	});

	it("preserves non-text foreign parts via convertForeignEvent fallback", async () => {
		const llmRequest = new LlmRequest();
		const foreign = new Event({
			author: "other-agent",
			content: {
				role: "model",
				parts: [
					{ text: "see image" },
					{
						inlineData: {
							mimeType: "image/png",
							data: "abc123",
						},
					},
				],
			},
		});

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [
					foreign,
					userEvent("describe"),
				]),
				llmRequest,
			),
		);

		expect(llmRequest.contents[0].parts?.[0]).toEqual({ text: "For context:" });
		expect(llmRequest.contents[0].parts?.[1]).toEqual({
			text: "[other-agent] said: see image",
		});
		expect(llmRequest.contents[0].parts?.[2]).toEqual({
			inlineData: { mimeType: "image/png", data: "abc123" },
		});
	});

	it("overwrites earlier functionResponse parts when merging duplicate ids", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{
							functionCall: { id: "c1", name: "tool_a", args: {} },
						},
						{
							functionCall: { id: "c2", name: "tool_b", args: {} },
						},
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c1",
								name: "tool_a",
								response: { a: 1 },
							},
						},
						{
							functionResponse: {
								id: "c2",
								name: "tool_b",
								response: { b: "early" },
							},
						},
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c2",
								name: "tool_b",
								response: { b: "late" },
							},
						},
					],
				},
			}),
			userEvent("after"),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const merged = llmRequest.contents.find((c) =>
			c.parts?.some((p) => p.functionResponse),
		);
		const byId = Object.fromEntries(
			(merged?.parts ?? [])
				.filter((p) => p.functionResponse?.id)
				.map((p) => [p.functionResponse!.id, p.functionResponse!.response]),
		);
		expect(byId.c1).toEqual({ a: 1 });
		expect(byId.c2).toEqual({ b: "late" });
	});

	it("returns empty contents for current_turn when only current-agent events exist", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(
					{
						name: "assistant",
						canonicalModel: "gpt-4o",
						includeContents: "current_turn",
					},
					[agentEvent("assistant", "solo")],
				),
				llmRequest,
			),
		);
		expect(llmRequest.contents).toEqual([]);
	});

	it("leaves history unchanged when latest functionResponse has no matching functionCall", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("before"),
			agentEvent("assistant", "chatter"),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "orphan-fr",
								name: "missing_tool",
								response: { ok: false },
							},
						},
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		// Orphan FR takes the functionCallEventIdx === -1 path, then async
		// history rearrange drops FR events that were never paired to a call.
		expect(llmRequest.contents.map((c) => c.parts?.[0])).toEqual([
			{ text: "before" },
			{ text: "chatter" },
		]);
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => p.functionResponse?.id === "orphan-fr"),
			),
		).toBe(false);
	});

	it("merges intermediate functionResponses into the latest async response", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{ functionCall: { id: "c1", name: "tool_a", args: {} } },
						{ functionCall: { id: "c2", name: "tool_b", args: {} } },
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c1",
								name: "tool_a",
								response: { a: 1 },
							},
						},
					],
				},
			}),
			agentEvent("assistant", "should-drop"),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c2",
								name: "tool_b",
								response: { b: 2 },
							},
						},
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.flatMap(
			(c) => c.parts?.map((p) => p.text).filter(Boolean) ?? [],
		);
		expect(texts).not.toContain("should-drop");
		const merged = llmRequest.contents.find((c) =>
			c.parts?.some((p) => p.functionResponse),
		);
		expect(merged?.parts?.map((p) => p.functionResponse?.id).sort()).toEqual([
			"c1",
			"c2",
		]);
	});

	it("handles overlapping compaction events by keeping the later synthesized summary", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("hist-1", { timestamp: 1 }),
			agentEvent("assistant", "hist-2", { timestamp: 2 }),
			userEvent("hist-3", { timestamp: 3 }),
			new Event({
				author: "assistant",
				timestamp: 4,
				content: { role: "model", parts: [{ text: "compaction-a" }] },
				actions: new EventActions({
					compaction: {
						startTimestamp: 1,
						endTimestamp: 2.5,
						compactedContent: {
							role: "model",
							parts: [{ text: "summary-early" }],
						},
					},
				}),
			}),
			userEvent("mid", { timestamp: 5 }),
			new Event({
				author: "assistant",
				timestamp: 6,
				content: { role: "model", parts: [{ text: "compaction-b" }] },
				actions: new EventActions({
					compaction: {
						startTimestamp: 3,
						endTimestamp: 5.5,
						compactedContent: {
							role: "model",
							parts: [{ text: "summary-late" }],
						},
					},
				}),
			}),
			userEvent("tail", { timestamp: 7 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.map((c) => c.parts?.[0]?.text);
		expect(texts).toContain("summary-late");
		expect(texts).toContain("tail");
		expect(texts).not.toContain("hist-1");
		expect(texts).not.toContain("hist-3");
		expect(texts).not.toContain("mid");
		expect(texts).not.toContain("compaction-a");
		expect(texts).not.toContain("compaction-b");
	});

	it("drops rewind marker without jumping when rewindBeforeInvocationId is unknown", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("keep", { invocationId: "inv-a", timestamp: 1 }),
			new Event({
				author: "user",
				invocationId: "inv-rewind",
				timestamp: 2,
				content: { role: "user", parts: [{ text: "rewind-marker" }] },
				actions: new EventActions({
					rewindBeforeInvocationId: "missing-inv",
				}),
			}),
			userEvent("after", { invocationId: "inv-c", timestamp: 3 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"keep",
			"after",
		]);
	});

	it("starts current_turn from a foreign-agent reply", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("old-user", { timestamp: 1 }),
			agentEvent("assistant", "old-self", { timestamp: 2 }),
			agentEvent("other-agent", "handoff context", { timestamp: 3 }),
			agentEvent("assistant", "after-handoff", { timestamp: 4 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(
					{
						name: "assistant",
						canonicalModel: "gpt-4o",
						includeContents: "current_turn",
					},
					events,
				),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.flatMap(
			(c) => c.parts?.map((p) => p.text).filter(Boolean) ?? [],
		);
		expect(texts.some((t) => t?.includes("handoff context"))).toBe(true);
		expect(texts).toContain("after-handoff");
		expect(texts).not.toContain("old-user");
		expect(texts).not.toContain("old-self");
	});

	it("includes events with undefined branch when invocation branch is set", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("unbranched"),
			userEvent("other-branch", { branch: "root.other" }),
			userEvent("matching", { branch: "root" }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events, "root.child"),
				llmRequest,
			),
		);

		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"unbranched",
			"matching",
		]);
	});

	it("skips parts whose only text is an empty string", async () => {
		const llmRequest = new LlmRequest();
		const emptyText = new Event({
			author: "user",
			content: { role: "user", parts: [{ text: "" }] },
		});

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [emptyText, userEvent("kept")]),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toHaveLength(1);
		expect(llmRequest.contents[0].parts?.[0]).toEqual({ text: "kept" });
	});

	it("does not rearrange when latest functionResponse parts lack ids", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [{ functionCall: { id: "c1", name: "tool", args: {} } }],
				},
			}),
			agentEvent("assistant", "middle"),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								name: "tool",
								response: { ok: true },
							},
						},
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		// FR parts without ids never populate functionResponseIds, so the -1 path
		// runs; async history rearrange then drops unpaired FR events.
		expect(
			llmRequest.contents.map(
				(c) =>
					c.parts?.[0]?.text ??
					c.parts?.[0]?.functionCall?.id ??
					c.parts?.[0]?.functionResponse?.name,
			),
		).toEqual(["c1", "middle"]);
	});

	it("returns early when the event before latest functionResponse is malformed", async () => {
		const llmRequest = new LlmRequest();
		const malformed = new Event({
			author: "assistant",
			content: {
				role: "model",
				parts: [{ text: "broken-prev" }],
			},
		});
		(malformed as any).getFunctionCalls = undefined;
		(malformed as any).getFunctionResponses = undefined;
		const events = [
			userEvent("before"),
			malformed,
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c1",
								name: "tool",
								response: { ok: true },
							},
						},
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		// Latest-FR rearrange returns early on malformed prev; unpaired FR is
		// then dropped by async history rearrange, while the malformed event is
		// preserved via the safety pass-through.
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"before",
			"broken-prev",
		]);
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => p.functionResponse?.id === "c1"),
			),
		).toBe(false);
	});

	it("keeps non-functionResponse trailing parts when merging async responses", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{ functionCall: { id: "c1", name: "tool_a", args: {} } },
						{ functionCall: { id: "c2", name: "tool_b", args: {} } },
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c1",
								name: "tool_a",
								response: { a: 1 },
							},
						},
						{ text: "note-from-first" },
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c2",
								name: "tool_b",
								response: { b: 2 },
							},
						},
						{ text: "note-from-second" },
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const merged = llmRequest.contents.find((c) =>
			c.parts?.some((p) => p.functionResponse),
		);
		const texts = merged?.parts?.map((p) => p.text).filter(Boolean);
		expect(texts).toEqual(
			expect.arrayContaining(["note-from-first", "note-from-second"]),
		);
		expect(
			merged?.parts
				?.map((p) => p.functionResponse?.id)
				.filter(Boolean)
				.sort(),
		).toEqual(["c1", "c2"]);
	});

	it("builds empty contents for default includeContents with empty session", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), []),
				llmRequest,
			),
		);
		expect(llmRequest.contents).toEqual([]);
	});

	it("leaves history unchanged when latest event is malformed without getFunctionResponses", async () => {
		const llmRequest = new LlmRequest();
		const malformed = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [{ text: "latest-malformed" }],
			},
		});
		(malformed as any).getFunctionResponses = undefined;
		(malformed as any).getFunctionCalls = undefined;
		const events = [
			userEvent("earlier"),
			agentEvent("assistant", "reply"),
			malformed,
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"earlier",
			"reply",
			"latest-malformed",
		]);
	});

	it("skips malformed events while reverse-searching for async functionCall", async () => {
		const llmRequest = new LlmRequest();
		const malformed = new Event({
			author: "assistant",
			content: {
				role: "model",
				parts: [{ text: "broken-mid" }],
			},
		});
		(malformed as any).getFunctionCalls = undefined;
		(malformed as any).getFunctionResponses = undefined;

		const events = [
			userEvent("start"),
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [{ functionCall: { id: "c9", name: "tool", args: {} } }],
				},
			}),
			malformed,
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "other",
								name: "other_tool",
								response: { n: 1 },
							},
						},
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c9",
								name: "tool",
								response: { ok: true },
							},
						},
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => p.functionCall?.id === "c9"),
			),
		).toBe(true);
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => p.functionResponse?.id === "c9"),
			),
		).toBe(true);
		expect(llmRequest.contents[0].parts?.[0]?.text).toBe("start");
	});

	it("skips malformed events while collecting intermediate async functionResponses", async () => {
		const llmRequest = new LlmRequest();
		const malformed = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [{ text: "mid-broken" }],
			},
		});
		(malformed as any).getFunctionCalls = undefined;
		(malformed as any).getFunctionResponses = undefined;

		const events = [
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{ functionCall: { id: "c1", name: "tool_a", args: {} } },
						{ functionCall: { id: "c2", name: "tool_b", args: {} } },
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c1",
								name: "tool_a",
								response: { a: 1 },
							},
						},
					],
				},
			}),
			malformed,
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "c2",
								name: "tool_b",
								response: { b: 2 },
							},
						},
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const merged = llmRequest.contents.find((c) =>
			c.parts?.some((p) => p.functionResponse),
		);
		expect(
			merged?.parts
				?.map((p) => p.functionResponse?.id)
				.filter(Boolean)
				.sort(),
		).toEqual(["c1", "c2"]);
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toContain(
			"mid-broken",
		);
	});

	it("preserves branch-filtered foreign events and current-turn user text", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("root-user", { branch: "root" }),
			agentEvent("other-agent", "foreign reply", { branch: "root" }),
			userEvent("leaf-user", { branch: "root.leaf" }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events, "root.leaf"),
				llmRequest,
			),
		);

		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual(
			expect.arrayContaining(["leaf-user"]),
		);
	});

	it("drops auth request function calls from contents history", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("hello"),
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "auth-1",
								name: REQUEST_EUC_FUNCTION_CALL_NAME,
								args: {},
							},
						},
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "auth-1",
								name: REQUEST_EUC_FUNCTION_CALL_NAME,
								response: { token: "x" },
							},
						},
					],
				},
			}),
			userEvent("after-auth"),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some(
					(p) =>
						p.functionCall?.name === REQUEST_EUC_FUNCTION_CALL_NAME ||
						p.functionResponse?.name === REQUEST_EUC_FUNCTION_CALL_NAME,
				),
			),
		).toBe(false);
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual(
			expect.arrayContaining(["hello", "after-auth"]),
		);
	});

	it("converts foreign multi-part event with text, functionCall, functionResponse, and inlineData", async () => {
		const llmRequest = new LlmRequest();
		const foreign = new Event({
			author: "other-agent",
			content: {
				role: "model",
				parts: [
					{ text: "analysis" },
					{
						functionCall: {
							id: "fc-mix",
							name: "search",
							args: { q: "docs" },
						},
					},
					{
						functionResponse: {
							id: "fc-mix",
							name: "search",
							response: { hits: 2 },
						},
					},
					{
						inlineData: {
							mimeType: "image/jpeg",
							data: "deadbeef",
						},
					},
				],
			},
		});

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [
					foreign,
					userEvent("summarize"),
				]),
				llmRequest,
			),
		);

		const rewritten = llmRequest.contents[0];
		expect(rewritten.role).toBe("user");
		expect(rewritten.parts?.[0]).toEqual({ text: "For context:" });
		expect(rewritten.parts?.[1]).toEqual({
			text: "[other-agent] said: analysis",
		});
		expect(rewritten.parts?.[2]?.text).toContain(
			"[other-agent] called tool `search`",
		);
		expect(rewritten.parts?.[2]?.text).toContain('"q":"docs"');
		expect(rewritten.parts?.[3]?.text).toContain(
			"[other-agent] `search` tool returned result:",
		);
		expect(rewritten.parts?.[3]?.text).toContain('"hits":2');
		expect(rewritten.parts?.[4]).toEqual({
			inlineData: { mimeType: "image/jpeg", data: "deadbeef" },
		});
		expect(llmRequest.contents[1].parts?.[0]).toEqual({ text: "summarize" });
	});

	it("skips whole event when EUC functionCall is mixed with text parts", async () => {
		const llmRequest = new LlmRequest();
		const mixedAuth = new Event({
			author: "assistant",
			content: {
				role: "model",
				parts: [
					{ text: "need credentials" },
					{
						functionCall: {
							id: "euc-mix",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: { scope: "drive" },
						},
					},
				],
			},
		});

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [
					userEvent("before-auth"),
					mixedAuth,
					userEvent("after-auth"),
				]),
				llmRequest,
			),
		);

		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"before-auth",
			"after-auth",
		]);
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => p.text === "need credentials"),
			),
		).toBe(false);
	});

	it("skips EUC functionResponse-only events even when adjacent to real turns", async () => {
		const llmRequest = new LlmRequest();
		const eucFrOnly = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-fr-only",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: { token: "secret" },
						},
					},
				],
			},
		});

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [
					userEvent("ask"),
					eucFrOnly,
					agentEvent("assistant", "reply"),
				]),
				llmRequest,
			),
		);

		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"ask",
			"reply",
		]);
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some(
					(p) => p.functionResponse?.name === REQUEST_EUC_FUNCTION_CALL_NAME,
				),
			),
		).toBe(false);
	});

	it("applies branch prefix matrix for root.a.b invocation", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("keep-ancestor", { branch: "root.a" }),
			userEvent("drop-deeper", { branch: "root.a.b.c" }),
			userEvent("keep-exact", { branch: "root.a.b" }),
			userEvent("keep-unbranched"),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events, "root.a.b"),
				llmRequest,
			),
		);

		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"keep-ancestor",
			"keep-exact",
			"keep-unbranched",
		]);
	});

	it("keeps events when both invocation and event branches are undefined", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("alpha"),
			agentEvent("assistant", "beta"),
			userEvent("gamma"),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"alpha",
			"beta",
			"gamma",
		]);
	});

	it("applies rewind then compaction so discarded range never reappears", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("pre-rewind", { invocationId: "inv-keep", timestamp: 1 }),
			agentEvent("assistant", "pre-rewind-reply", {
				invocationId: "inv-keep",
				timestamp: 2,
			}),
			userEvent("to-discard", { invocationId: "inv-gone", timestamp: 3 }),
			agentEvent("assistant", "to-discard-reply", {
				invocationId: "inv-gone",
				timestamp: 4,
			}),
			new Event({
				author: "user",
				invocationId: "inv-rewind",
				timestamp: 5,
				content: { role: "user", parts: [{ text: "rewind-marker" }] },
				actions: new EventActions({
					rewindBeforeInvocationId: "inv-gone",
				}),
			}),
			userEvent("post-rewind", { invocationId: "inv-new", timestamp: 6 }),
			agentEvent("assistant", "post-rewind-reply", {
				invocationId: "inv-new",
				timestamp: 7,
			}),
			new Event({
				author: "assistant",
				invocationId: "inv-compact",
				timestamp: 8,
				content: {
					role: "model",
					parts: [{ text: "compaction-marker" }],
				},
				actions: new EventActions({
					compaction: {
						startTimestamp: 1,
						endTimestamp: 6.5,
						compactedContent: {
							role: "model",
							parts: [{ text: "compacted after rewind" }],
						},
					},
				}),
			}),
			userEvent("tail", { invocationId: "inv-tail", timestamp: 9 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.map((c) => c.parts?.[0]?.text);
		expect(texts).toEqual(["compacted after rewind", "tail"]);
		expect(texts).not.toContain("to-discard");
		expect(texts).not.toContain("to-discard-reply");
		expect(texts).not.toContain("rewind-marker");
		expect(texts).not.toContain("pre-rewind");
		expect(texts).not.toContain("post-rewind");
		expect(texts).not.toContain("post-rewind-reply");
		expect(texts).not.toContain("compaction-marker");
	});

	it("keeps a single shared FR event when two FC ids map to the same response event", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("prompt"),
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{ functionCall: { id: "same-a", name: "tool_a", args: {} } },
						{ functionCall: { id: "same-b", name: "tool_b", args: {} } },
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "same-a",
								name: "tool_a",
								response: { a: 1 },
							},
						},
						{
							functionResponse: {
								id: "same-b",
								name: "tool_b",
								response: { b: 2 },
							},
						},
					],
				},
			}),
			userEvent("done"),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const frEvents = llmRequest.contents.filter((c) =>
			c.parts?.some((p) => p.functionResponse),
		);
		expect(frEvents).toHaveLength(1);
		expect(
			frEvents[0].parts
				?.map((p) => p.functionResponse?.id)
				.filter(Boolean)
				.sort(),
		).toEqual(["same-a", "same-b"]);
		expect(llmRequest.contents.at(-1)?.parts?.[0]).toEqual({ text: "done" });
	});

	it("merges intermediate FR for b with late FR for a trailing the functionCall", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{ functionCall: { id: "a", name: "tool_a", args: {} } },
						{ functionCall: { id: "b", name: "tool_b", args: {} } },
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "b",
								name: "tool_b",
								response: { b: "early" },
							},
						},
					],
				},
			}),
			agentEvent("assistant", "noise-between"),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "a",
								name: "tool_a",
								response: { a: "late" },
							},
						},
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.flatMap(
			(c) => c.parts?.map((p) => p.text).filter(Boolean) ?? [],
		);
		expect(texts).not.toContain("noise-between");
		const merged = llmRequest.contents.find((c) =>
			c.parts?.some((p) => p.functionResponse),
		);
		const byId = Object.fromEntries(
			(merged?.parts ?? [])
				.filter((p) => p.functionResponse?.id)
				.map((p) => [p.functionResponse!.id, p.functionResponse!.response]),
		);
		expect(byId.a).toEqual({ a: "late" });
		expect(byId.b).toEqual({ b: "early" });
		expect(
			llmRequest.contents[0].parts?.map((p) => p.functionCall?.id),
		).toEqual(["a", "b"]);
		expect(llmRequest.contents).toHaveLength(2);
	});

	it('builds current-turn only when includeContents is ""', async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("old", { invocationId: "inv-1", timestamp: 1 }),
			agentEvent("assistant", "old-reply", {
				invocationId: "inv-1",
				timestamp: 2,
			}),
			userEvent("fresh", { invocationId: "inv-2", timestamp: 3 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(
					{
						name: "assistant",
						canonicalModel: "gpt-4o",
						includeContents: "",
					},
					events,
				),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.map((c) => c.parts?.[0]?.text);
		expect(texts).toEqual(["fresh"]);
	});

	it("builds current-turn only when includeContents is omitted", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("history", { timestamp: 1 }),
			agentEvent("assistant", "history-reply", { timestamp: 2 }),
			userEvent("now", { timestamp: 3 }),
			agentEvent("assistant", "now-reply", { timestamp: 4 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(
					{
						name: "assistant",
						canonicalModel: "gpt-4o",
					},
					events,
				),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.map((c) => c.parts?.[0]?.text);
		expect(texts).toEqual(["now", "now-reply"]);
		expect(texts).not.toContain("history");
	});

	it("does not rewrite foreign authors when agent name is empty", async () => {
		const llmRequest = new LlmRequest();
		const foreign = new Event({
			author: "other-agent",
			content: {
				role: "model",
				parts: [{ text: "peer message" }],
			},
		});

		await drain(
			requestProcessor.runAsync(
				ctx(
					{
						name: "",
						canonicalModel: "gpt-4o",
						includeContents: "default",
					},
					[foreign, userEvent("continue")],
				),
				llmRequest,
			),
		);

		expect(llmRequest.contents[0].role).toBe("model");
		expect(llmRequest.contents[0].parts?.[0]).toEqual({
			text: "peer message",
		});
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => p.text?.startsWith("For context:")),
			),
		).toBe(false);
	});

	it("starts current_turn from mid-history user and keeps in-turn tool call", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("ancient", { timestamp: 1 }),
			agentEvent("assistant", "ancient-reply", { timestamp: 2 }),
			userEvent("turn-start", { timestamp: 3 }),
			new Event({
				author: "assistant",
				timestamp: 4,
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "turn-fc",
								name: "lookup",
								args: { q: "now" },
							},
						},
					],
				},
			}),
			agentEvent("assistant", "turn-answer", { timestamp: 5 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(
					{
						name: "assistant",
						canonicalModel: "gpt-4o",
						includeContents: "current_turn",
					},
					events,
				),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.flatMap(
			(c) => c.parts?.map((p) => p.text).filter(Boolean) ?? [],
		);
		expect(texts).toContain("turn-start");
		expect(texts).toContain("turn-answer");
		expect(texts).not.toContain("ancient");
		expect(texts).not.toContain("ancient-reply");
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => p.functionCall?.id === "turn-fc"),
			),
		).toBe(true);
	});

	it("current_turn restarts at a later functionResponse user event", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("turn-start", { timestamp: 1 }),
			new Event({
				author: "assistant",
				timestamp: 2,
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "fr-turn",
								name: "lookup",
								args: {},
							},
						},
					],
				},
			}),
			new Event({
				author: "user",
				timestamp: 3,
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "fr-turn",
								name: "lookup",
								response: { value: 1 },
							},
						},
					],
				},
			}),
			agentEvent("assistant", "after-tool", { timestamp: 4 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(
					{
						name: "assistant",
						canonicalModel: "gpt-4o",
						includeContents: "current_turn",
					},
					events,
				),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.flatMap(
			(c) => c.parts?.map((p) => p.text).filter(Boolean) ?? [],
		);
		expect(texts).toContain("after-tool");
		expect(texts).not.toContain("turn-start");
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some(
					(p) =>
						p.functionResponse?.id === "fr-turn" ||
						p.functionCall?.id === "fr-turn",
				),
			),
		).toBe(false);
	});

	it("strips only adk- prefixed ids and preserves provider ids", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			new Event({
				author: "assistant",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "adk-uuid-fc",
								name: "client_tool",
								args: {},
							},
						},
						{
							functionCall: {
								id: "provider-fc-9",
								name: "server_tool",
								args: { n: 1 },
							},
						},
					],
				},
			}),
			new Event({
				author: "user",
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "adk-uuid-fc",
								name: "client_tool",
								response: { ok: true },
							},
						},
						{
							functionResponse: {
								id: "provider-fc-9",
								name: "server_tool",
								response: { n: 1 },
							},
						},
					],
				},
			}),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const fcParts = llmRequest.contents[0].parts ?? [];
		expect(fcParts[0]?.functionCall?.id).toBeUndefined();
		expect(fcParts[0]?.functionCall?.name).toBe("client_tool");
		expect(fcParts[1]?.functionCall?.id).toBe("provider-fc-9");

		const frParts = llmRequest.contents[1].parts ?? [];
		expect(frParts[0]?.functionResponse?.id).toBeUndefined();
		expect(frParts[0]?.functionResponse?.name).toBe("client_tool");
		expect(frParts[1]?.functionResponse?.id).toBe("provider-fc-9");
	});

	it("strips adk- id from functionCall-only content without responses", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [
					new Event({
						author: "assistant",
						content: {
							role: "model",
							parts: [
								{
									functionCall: {
										id: "adk-orphan-call",
										name: "pending",
										args: { x: 1 },
									},
								},
							],
						},
					}),
					userEvent("continue"),
				]),
				llmRequest,
			),
		);

		expect(llmRequest.contents[0].parts?.[0]?.functionCall).toEqual({
			id: undefined,
			name: "pending",
			args: { x: 1 },
		});
	});

	it("compacts only surviving rewind-filtered events when ranges overlap rewind boundary", async () => {
		const llmRequest = new LlmRequest();
		const events = [
			userEvent("keep-early", { invocationId: "inv-a", timestamp: 1 }),
			userEvent("discard-mid", { invocationId: "inv-b", timestamp: 2 }),
			new Event({
				author: "user",
				invocationId: "inv-rewind",
				timestamp: 3,
				content: { role: "user", parts: [{ text: "rewind" }] },
				actions: new EventActions({
					rewindBeforeInvocationId: "inv-b",
				}),
			}),
			userEvent("after", { invocationId: "inv-c", timestamp: 4 }),
			new Event({
				author: "assistant",
				invocationId: "inv-compact",
				timestamp: 5,
				content: { role: "model", parts: [{ text: "c-marker" }] },
				actions: new EventActions({
					compaction: {
						startTimestamp: 1,
						endTimestamp: 4.5,
						compactedContent: {
							role: "model",
							parts: [{ text: "summary-of-survivors" }],
						},
					},
				}),
			}),
			userEvent("final", { invocationId: "inv-d", timestamp: 6 }),
		];

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), events),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.map((c) => c.parts?.[0]?.text);
		expect(texts).toEqual(["summary-of-survivors", "final"]);
		expect(texts).not.toContain("discard-mid");
		expect(texts).not.toContain("keep-early");
		expect(texts).not.toContain("after");
	});
});
