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
			name: "assistant",
			canonicalModel: "gpt-4o",
			includeContents: "default",
		},
		session: { events },
		runConfig: {},
	} as unknown as InvocationContext;
}

function history(rewindBeforeInvocationId: unknown): Event[] {
	return [
		new Event({
			author: "user",
			invocationId: "inv-a",
			content: { role: "user", parts: [{ text: "keep-a" }] },
		}),
		new Event({
			author: "assistant",
			invocationId: "inv-b",
			content: { role: "model", parts: [{ text: "keep-b" }] },
		}),
		new Event({
			author: "user",
			invocationId: "inv-marker",
			content: { role: "user", parts: [{ text: "marker-text" }] },
			actions: { rewindBeforeInvocationId } as any,
		}),
	];
}

async function textsForRewind(id: unknown): Promise<string[]> {
	const request = new LlmRequest();
	await drain(requestProcessor.runAsync(ctx(history(id)), request));
	return (request.contents ?? []).flatMap((c) =>
		(c.parts ?? []).map((p) => p.text ?? ""),
	);
}

describe("contents rewindBeforeInvocationId falsy / case twelfth leftover", () => {
	it.each([
		{ label: "empty string", id: "" },
		{ label: "0", id: 0 },
		{ label: "false", id: false },
	])("falsy $label keeps the marker as a normal event (else branch)", async ({
		id,
	}) => {
		const texts = await textsForRewind(id);
		expect(texts).toContain("keep-a");
		expect(texts).toContain("keep-b");
		expect(texts).toContain("marker-text");
	});

	it("whitespace rewind id is truthy but misses the map so the marker is dropped without a jump", async () => {
		const texts = await textsForRewind(" ");
		expect(texts).toContain("keep-a");
		expect(texts).toContain("keep-b");
		expect(texts).not.toContain("marker-text");
	});

	it("case-mismatched rewind id misses Map.get so history is kept minus the marker", async () => {
		const texts = await textsForRewind("Inv-A");
		expect(texts).toContain("keep-a");
		expect(texts).toContain("keep-b");
		expect(texts).not.toContain("marker-text");
	});

	it("exact inv-a jumps earlier than the marker and drops later keep-b", async () => {
		const texts = await textsForRewind("inv-a");
		expect(texts).not.toContain("keep-a");
		expect(texts).not.toContain("keep-b");
		expect(texts).not.toContain("marker-text");
	});
});
