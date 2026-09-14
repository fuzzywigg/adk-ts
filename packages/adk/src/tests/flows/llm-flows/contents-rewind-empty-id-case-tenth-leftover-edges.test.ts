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

function textsOf(request: LlmRequest): string[] {
	return (request.contents ?? []).flatMap((c) =>
		(c.parts ?? []).map((p) => p.text).filter((t): t is string => Boolean(t)),
	);
}

describe("contents rewind empty / case-sensitive map tenth leftover", () => {
	it("empty-string rewindBeforeInvocationId is falsy so the marker is kept", async () => {
		const events = [
			new Event({
				author: "user",
				invocationId: "inv-a",
				content: { role: "user", parts: [{ text: "keep-a" }] },
			}),
			new Event({
				author: "user",
				invocationId: "marker",
				content: { role: "user", parts: [{ text: "marker-kept" }] },
				actions: { rewindBeforeInvocationId: "" } as any,
			}),
		];
		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx(events), request));
		expect(textsOf(request)).toEqual(["keep-a", "marker-kept"]);
	});

	it('empty invocationId is never indexed so a truthy rewind to "" cannot jump', async () => {
		const events = [
			new Event({
				author: "user",
				invocationId: "",
				content: { role: "user", parts: [{ text: "empty-id" }] },
			}),
			new Event({
				author: "user",
				invocationId: "inv-b",
				content: { role: "user", parts: [{ text: "later" }] },
			}),
			new Event({
				author: "user",
				invocationId: "marker",
				content: { role: "user", parts: [{ text: "marker-dropped" }] },
				actions: { rewindBeforeInvocationId: " " } as any,
			}),
		];
		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx(events), request));
		expect(textsOf(request)).toEqual(["empty-id", "later"]);
		expect(textsOf(request)).not.toContain("marker-dropped");
	});

	it("rewindBeforeInvocationId is case-sensitive against the invocationId map", async () => {
		const events = [
			new Event({
				author: "user",
				invocationId: "Inv-A",
				content: { role: "user", parts: [{ text: "keep-cased" }] },
			}),
			new Event({
				author: "user",
				invocationId: "inv-b",
				content: { role: "user", parts: [{ text: "after" }] },
			}),
			new Event({
				author: "user",
				invocationId: "marker",
				content: { role: "user", parts: [{ text: "marker" }] },
				actions: { rewindBeforeInvocationId: "inv-a" } as any,
			}),
		];
		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx(events), request));
		expect(textsOf(request)).toEqual(["keep-cased", "after"]);
	});

	it("exact-case rewind drops from the target invocation onward", async () => {
		const events = [
			new Event({
				author: "user",
				invocationId: "inv-a",
				content: { role: "user", parts: [{ text: "keep-a" }] },
			}),
			new Event({
				author: "agent",
				invocationId: "inv-a",
				content: { role: "model", parts: [{ text: "keep-b" }] },
			}),
			new Event({
				author: "user",
				invocationId: "inv-b",
				content: { role: "user", parts: [{ text: "discarded" }] },
			}),
			new Event({
				author: "user",
				invocationId: "marker",
				content: { role: "user", parts: [{ text: "marker" }] },
				actions: { rewindBeforeInvocationId: "inv-b" } as any,
			}),
			new Event({
				author: "user",
				invocationId: "inv-c",
				content: { role: "user", parts: [{ text: "after-rewind" }] },
			}),
		];
		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx(events), request));
		expect(textsOf(request)).toEqual(["keep-a", "keep-b", "after-rewind"]);
		expect(textsOf(request)).not.toContain("discarded");
		expect(textsOf(request)).not.toContain("marker");
	});
});
