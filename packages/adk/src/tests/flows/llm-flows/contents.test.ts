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
});
