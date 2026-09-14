import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
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

function duckAgent(name: string, includeContents: string) {
	return {
		name,
		includeContents,
		canonicalModel: {},
	} as any;
}

function ctx(agent: any, events: Event[], branch?: string): InvocationContext {
	return {
		agent,
		branch,
		session: { events, id: "s1", appName: "app", userId: "u1", state: {} },
	} as any;
}

function userEvent(text: string, opts: Partial<Event> = {}): Event {
	return new Event({
		author: "user",
		content: { role: "user", parts: [{ text }] },
		...opts,
	});
}

describe("contents leftover edges (post #124)", () => {
	it("skips auth functionCall events that would otherwise enter history", async () => {
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

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [
					userEvent("hi"),
					authCall,
					userEvent("after"),
				]),
				llmRequest,
			),
		);

		const texts = llmRequest.contents.flatMap(
			(c) => c.parts?.map((p) => p.text).filter(Boolean) || [],
		);
		expect(texts).toContain("hi");
		expect(texts).toContain("after");
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some(
					(p) => p.functionCall?.name === REQUEST_EUC_FUNCTION_CALL_NAME,
				),
			),
		).toBe(false);
	});

	it("skips auth functionResponse events authored by the user", async () => {
		const llmRequest = new LlmRequest();
		const authResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-2",
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
					authResponse,
					userEvent("after"),
				]),
				llmRequest,
			),
		);

		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some(
					(p) => p.functionResponse?.name === REQUEST_EUC_FUNCTION_CALL_NAME,
				),
			),
		).toBe(false);
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"before",
			"after",
		]);
	});

	it("throws when mergeFunctionResponseEvents receives a first event without parts", async () => {
		const llmRequest = new LlmRequest();
		const call = new Event({
			author: "assistant",
			content: {
				role: "model",
				parts: [
					{ functionCall: { id: "m1", name: "a", args: {} } },
					{ functionCall: { id: "m2", name: "b", args: {} } },
				],
			},
		});
		const r1 = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "m1",
							name: "a",
							response: { a: 1 },
						},
					},
				],
			},
		});
		const r2 = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "m2",
							name: "b",
							response: { b: 2 },
						},
					},
				],
			},
		});

		const originalParse = JSON.parse;
		let stripped = false;
		const parseSpy = vi.spyOn(JSON, "parse").mockImplementation(((
			text: string,
			reviver?: (this: any, key: string, value: any) => any,
		) => {
			const result = originalParse(text, reviver);
			if (
				!stripped &&
				result?.content?.parts?.some((p: any) => p.functionResponse)
			) {
				stripped = true;
				delete result.content.parts;
			}
			return result;
		}) as typeof JSON.parse);

		await expect(
			drain(
				requestProcessor.runAsync(
					ctx(duckAgent("assistant", "default"), [call, r1, r2]),
					llmRequest,
				),
			),
		).rejects.toThrow(/at least one function_response part/i);

		parseSpy.mockRestore();
	});

	it("throws when a later merge event lacks parts", async () => {
		const llmRequest = new LlmRequest();
		const call = new Event({
			author: "assistant",
			content: {
				role: "model",
				parts: [
					{ functionCall: { id: "n1", name: "a", args: {} } },
					{ functionCall: { id: "n2", name: "b", args: {} } },
				],
			},
		});
		const r1 = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "n1",
							name: "a",
							response: { a: 1 },
						},
					},
				],
			},
		});
		const r2 = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "n2",
							name: "b",
							response: { b: 2 },
						},
					},
				],
			},
		});

		const originalStringify = JSON.stringify;
		const stringifySpy = vi.spyOn(JSON, "stringify").mockImplementation(((
			value: any,
			...rest: any[]
		) => {
			const out = (originalStringify as any)(value, ...rest);
			if (
				value?.content?.parts?.some((p: any) => p.functionResponse?.id === "n1")
			) {
				delete (r2.content as any).parts;
			}
			return out;
		}) as typeof JSON.stringify);

		await expect(
			drain(
				requestProcessor.runAsync(
					ctx(duckAgent("assistant", "default"), [call, r1, r2]),
					llmRequest,
				),
			),
		).rejects.toThrow(/at least one function_response part/i);

		stringifySpy.mockRestore();
	});

	it("converts foreign agent functionCall and functionResponse into context text", async () => {
		const llmRequest = new LlmRequest();
		const foreign = new Event({
			author: "other",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "fc",
							name: "search",
							args: { q: "x" },
						},
					},
					{
						functionResponse: {
							id: "fc",
							name: "search",
							response: { hits: 1 },
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

		const joined = llmRequest.contents
			.flatMap((c) => c.parts?.map((p) => p.text) || [])
			.join("\n");
		expect(joined).toContain("For context:");
		expect(joined).toContain("[other] called tool `search`");
		expect(joined).toContain("[other] `search` tool returned result");
	});

	it("includeContents current-turn path still filters auth events", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "none"), [
					userEvent("old"),
					new Event({
						author: "assistant",
						content: {
							role: "model",
							parts: [
								{
									functionCall: {
										id: "euc-3",
										name: REQUEST_EUC_FUNCTION_CALL_NAME,
										args: {},
									},
								},
							],
						},
					}),
				]),
				llmRequest,
			),
		);
		expect(llmRequest.contents).toEqual([]);
	});
});
