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

function duckAgent(name: string) {
	return {
		name,
		canonicalModel: "gpt-4o",
		includeContents: "default" as const,
	};
}

function ctx(agent: object, events: Event[]): InvocationContext {
	return {
		agent,
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

describe("contents sixth leftover: thought-only hasAnyContent (post #151)", () => {
	it("skips thought-only parts (no text/FC/FR truthy content)", async () => {
		const events = [
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "keep-user" }] },
			}),
			new Event({
				author: "agent",
				content: {
					role: "model",
					parts: [{ thought: true } as any],
				},
			}),
			new Event({
				author: "agent",
				content: {
					role: "model",
					parts: [{ text: "keep-agent" }],
				},
			}),
		];

		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(ctx(duckAgent("agent"), events), request),
		);

		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p) => p.text).filter(Boolean),
		);
		expect(texts).toEqual(["keep-user", "keep-agent"]);
	});

	it("skips parts that only carry non-text/non-FC/FR payloads", async () => {
		const events = [
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "u" }] },
			}),
			new Event({
				author: "agent",
				content: {
					role: "model",
					parts: [
						{ inlineData: { mimeType: "image/png", data: "xx" } } as any,
						{ fileData: { fileUri: "gs://x" } } as any,
					],
				},
			}),
			new Event({
				author: "agent",
				content: { role: "model", parts: [{ text: "visible" }] },
			}),
		];

		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(ctx(duckAgent("agent"), events), request),
		);

		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p) => p.text).filter(Boolean),
		);
		expect(texts).toEqual(["u", "visible"]);
	});

	it("keeps events when thought coexists with truthy text", async () => {
		const events = [
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "ask" }] },
			}),
			new Event({
				author: "agent",
				content: {
					role: "model",
					parts: [{ text: "reasoned", thought: true } as any],
				},
			}),
		];

		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(ctx(duckAgent("agent"), events), request),
		);

		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p) => p.text).filter(Boolean),
		);
		expect(texts).toEqual(["ask", "reasoned"]);
	});

	it("keeps events with functionCall even if sibling parts are thought-only", async () => {
		const events = [
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "call" }] },
			}),
			new Event({
				author: "agent",
				content: {
					role: "model",
					parts: [
						{ thought: true } as any,
						{
							functionCall: {
								id: "c1",
								name: "tool",
								args: {},
							},
						},
					],
				},
			}),
		];

		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(ctx(duckAgent("agent"), events), request),
		);

		expect(request.contents).toHaveLength(2);
		expect(
			request.contents?.[1]?.parts?.some(
				(p) => p.functionCall?.name === "tool",
			),
		).toBe(true);
	});

	it("falsy empty string text alone is skipped by hasAnyContent", async () => {
		const events = [
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "keep" }] },
			}),
			new Event({
				author: "agent",
				content: {
					role: "model",
					parts: [{ text: "" }, { thought: true } as any],
				},
			}),
		];

		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(ctx(duckAgent("agent"), events), request),
		);

		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p) => p.text).filter((t) => t !== undefined),
		);
		expect(texts).toEqual(["keep"]);
	});
});
