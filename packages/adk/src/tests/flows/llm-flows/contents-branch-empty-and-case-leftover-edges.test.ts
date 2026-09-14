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

function userEvent(text: string, branch?: string): Event {
	return new Event({
		author: "user",
		content: { role: "user", parts: [{ text }] },
		branch,
	});
}

function ctx(events: Event[], branch?: string): InvocationContext {
	return {
		agent: {
			name: "assistant",
			canonicalModel: "gpt-4o",
			includeContents: "default",
		},
		branch,
		session: { events },
		runConfig: {},
	} as unknown as InvocationContext;
}

describe("contents isEventBelongsToBranch empty/case leftover (post #168)", () => {
	it("empty-string event.branch is falsy and belongs to all invocation branches", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(
					[
						userEvent("empty-branch", ""),
						userEvent("other", "root.other"),
						userEvent("match", "root"),
					],
					"root",
				),
				llmRequest,
			),
		);
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"empty-branch",
			"match",
		]);
	});

	it("empty-string invocation branch is falsy and keeps all events", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([userEvent("a", "x"), userEvent("b", "y")], ""),
				llmRequest,
			),
		);
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"a",
			"b",
		]);
	});

	it.each([
		{
			label: "Root vs root",
			invocation: "Root.leaf",
			events: [
				userEvent("wrong-case-root", "root"),
				userEvent("exact", "Root"),
				userEvent("leaf", "Root.leaf"),
			],
			expected: ["exact", "leaf"],
		},
		{
			label: "ROOT vs Root",
			invocation: "Root",
			events: [
				userEvent("upper", "ROOT"),
				userEvent("exact", "Root"),
				userEvent("lower", "root"),
			],
			expected: ["exact"],
		},
	])("startsWith branch match is case-sensitive ($label)", async ({
		invocation,
		events,
		expected,
	}) => {
		const llmRequest = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx(events, invocation), llmRequest));
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual(
			expected,
		);
	});

	it("exact case ancestor prefix still matches", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(
					[
						userEvent("ancestor", "Root"),
						userEvent("sibling", "Root.other"),
						userEvent("leaf", "Root.leaf"),
					],
					"Root.leaf",
				),
				llmRequest,
			),
		);
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"ancestor",
			"leaf",
		]);
	});
});
