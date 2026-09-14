import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { requestProcessor } from "../../../flows/llm-flows/contents";
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
		/* no events */
	}
}

function duckAgent(
	name: string,
	includeContents: "default" | "none" = "default",
) {
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
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events,
			lastUpdateTime: 0,
		},
	} as unknown as InvocationContext;
}

describe("contents fifth leftover edges (post #146)", () => {
	it("rewind when rewindIndex >= i drops marker without jumping earlier history", async () => {
		const events = [
			new Event({
				author: "user",
				invocationId: "inv-a",
				content: { role: "user", parts: [{ text: "keep-a" }] },
			}),
			new Event({
				author: "agent",
				invocationId: "inv-b",
				content: { role: "model", parts: [{ text: "keep-b" }] },
			}),
			new Event({
				author: "user",
				invocationId: "inv-c",
				content: { role: "user", parts: [{ text: "marker-after" }] },
				actions: { rewindBeforeInvocationId: "inv-c" } as any,
			}),
		];

		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(ctx(duckAgent("agent"), events), request),
		);

		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p: any) => p.text),
		);
		expect(texts).toContain("keep-a");
		expect(texts).toContain("keep-b");
		expect(texts).not.toContain("marker-after");
	});

	it("empty agentName disables foreign-author rewrite", async () => {
		const events = [
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "hi" }] },
			}),
			new Event({
				author: "other_agent",
				content: { role: "model", parts: [{ text: "foreign" }] },
			}),
		];

		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx({ ...duckAgent(""), name: "" }, events),
				request,
			),
		);

		const modelContents = (request.contents ?? []).filter(
			(c) => c.role === "model" || c.role === "user",
		);
		const foreign = modelContents.find((c) =>
			(c.parts ?? []).some((p: any) =>
				String(p.text ?? "").includes("foreign"),
			),
		);
		expect(foreign?.role).toBe("model");
		expect(
			(foreign?.parts ?? []).some((p: any) =>
				String(p.text ?? "").includes("For context"),
			),
		).toBe(false);
	});

	it("functionResponse / functionCall without id are skipped in async rearrange maps", async () => {
		const callNoId = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "lookup", args: { q: 1 } } }],
			},
		});
		const responseNoId = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "lookup",
							response: { ok: true },
						},
					},
				],
			},
		});
		const callWithId = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [{ functionCall: { id: "c1", name: "lookup", args: { q: 2 } } }],
			},
		});
		const responseWithId = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "c1",
							name: "lookup",
							response: { ok: true },
						},
					},
				],
			},
		});

		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("agent"), [
					callNoId,
					responseNoId,
					callWithId,
					responseWithId,
				]),
				request,
			),
		);

		const parts = (request.contents ?? []).flatMap((c) => c.parts ?? []);
		const calls = parts.filter((p: any) => p.functionCall);
		const responses = parts.filter((p: any) => p.functionResponse);
		expect(calls.some((p: any) => p.functionCall?.id === "c1")).toBe(true);
		expect(responses.some((p: any) => p.functionResponse?.id === "c1")).toBe(
			true,
		);
	});

	it("compaction drops events with timestamp >= lastCompactionStartTime", async () => {
		const events = [
			new Event({
				author: "user",
				timestamp: 10,
				content: { role: "user", parts: [{ text: "old" }] },
			}),
			new Event({
				author: "agent",
				timestamp: 20,
				content: { role: "model", parts: [{ text: "inside-window" }] },
			}),
			new Event({
				author: "user",
				timestamp: 30,
				content: { role: "user", parts: [{ text: "also-inside" }] },
			}),
			new Event({
				author: "agent",
				timestamp: 40,
				content: { role: "model", parts: [{ text: "marker" }] },
				actions: {
					compaction: {
						startTimestamp: 20,
						endTimestamp: 35,
						compactedContent: {
							role: "model",
							parts: [{ text: "SUMMARY" }],
						},
					},
				} as any,
			}),
			new Event({
				author: "user",
				timestamp: 50,
				content: { role: "user", parts: [{ text: "after" }] },
			}),
		];

		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(ctx(duckAgent("agent"), events), request),
		);

		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p: any) => p.text),
		);
		expect(texts).toContain("old");
		expect(texts).toContain("SUMMARY");
		expect(texts).toContain("after");
		expect(texts).not.toContain("inside-window");
		expect(texts).not.toContain("also-inside");
		expect(texts).not.toContain("marker");
	});

	it("non-default/non-none includeContents uses getCurrentTurnContents; empty agentName keeps foreign role", async () => {
		const events = [
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "history" }] },
			}),
			new Event({
				author: "peer",
				content: { role: "model", parts: [{ text: "peer-said" }] },
			}),
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "followup" }] },
			}),
		];

		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(
					{
						name: "",
						canonicalModel: "gpt-4o",
						includeContents: "current",
					},
					events,
				),
				request,
			),
		);

		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p: any) => p.text),
		);
		expect(texts).toContain("followup");
		expect(texts).not.toContain("history");
	});

	it("merges multiple async function responses for one multi-call event", async () => {
		const multiCall = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [
					{ functionCall: { id: "a", name: "t1", args: {} } },
					{ functionCall: { id: "b", name: "t2", args: {} } },
				],
			},
		});
		const respA = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{ functionResponse: { id: "a", name: "t1", response: { a: 1 } } },
				],
			},
		});
		const respB = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{ functionResponse: { id: "b", name: "t2", response: { b: 2 } } },
				],
			},
		});

		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("agent"), [multiCall, respA, respB]),
				request,
			),
		);

		const responseContents = (request.contents ?? []).filter((c) =>
			(c.parts ?? []).some((p: any) => p.functionResponse),
		);
		expect(responseContents.length).toBeGreaterThanOrEqual(1);
		const responseParts = responseContents.flatMap((c) => c.parts ?? []);
		expect(
			responseParts.filter((p: any) => p.functionResponse?.id === "a").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			responseParts.filter((p: any) => p.functionResponse?.id === "b").length,
		).toBeGreaterThanOrEqual(1);
	});
});
