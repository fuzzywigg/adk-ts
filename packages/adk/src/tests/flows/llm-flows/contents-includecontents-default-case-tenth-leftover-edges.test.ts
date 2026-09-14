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

function historyEvents(): Event[] {
	return [
		new Event({
			author: "user",
			content: { role: "user", parts: [{ text: "history" }] },
		}),
		new Event({
			author: "agent",
			content: { role: "model", parts: [{ text: "reply" }] },
		}),
		new Event({
			author: "user",
			content: { role: "user", parts: [{ text: "followup" }] },
		}),
	];
}

function ctx(includeContents: string): InvocationContext {
	return {
		agent: {
			name: "agent",
			canonicalModel: "gpt-4o",
			includeContents,
		},
		session: { events: historyEvents() },
		runConfig: {},
	} as unknown as InvocationContext;
}

function textsOf(request: LlmRequest): string[] {
	return (request.contents ?? []).flatMap((c) =>
		(c.parts ?? []).map((p) => p.text).filter((t): t is string => Boolean(t)),
	);
}

describe("contents includeContents === default case-sensitivity tenth leftover", () => {
	it("exact default includes full conversation history", async () => {
		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx("default"), request));
		expect(textsOf(request)).toEqual(["history", "reply", "followup"]);
	});

	it.each([
		"Default",
		"DEFAULT",
		" default",
	])("%j is not === default so getCurrentTurnContents drops earlier history", async (includeContents) => {
		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx(includeContents), request));
		expect(textsOf(request)).toEqual(["followup"]);
		expect(textsOf(request)).not.toContain("history");
	});

	it("none still leaves contents unset (distinct from Default fallthrough)", async () => {
		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx("none"), request));
		expect(request.contents ?? []).toEqual([]);
	});
});
