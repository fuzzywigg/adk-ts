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

function ctx(events: Event[]): InvocationContext {
	return {
		agent: {
			name: "agent",
			canonicalModel: "gpt-4o",
			includeContents: "default",
		},
		session: { events },
		runConfig: {},
	} as unknown as InvocationContext;
}

describe("contents empty role falsy skip tenth leftover", () => {
	it("role empty string is falsy so the event is dropped despite text parts", async () => {
		const events = [
			new Event({
				author: "user",
				content: { role: "", parts: [{ text: "ghost" }] },
			}),
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "keep" }] },
			}),
		];
		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx(events), request));
		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p) => p.text).filter(Boolean),
		);
		expect(texts).toEqual(["keep"]);
	});

	it("whitespace-only role is truthy and kept", async () => {
		const events = [
			new Event({
				author: "user",
				content: { role: " ", parts: [{ text: "space-role" }] },
			}),
		];
		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx(events), request));
		expect(request.contents?.[0]?.role).toBe(" ");
		expect(request.contents?.[0]?.parts?.[0]?.text).toBe("space-role");
	});
});
