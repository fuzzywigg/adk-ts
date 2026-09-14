import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fourteenth leftover: convertEventToJson uses truthy `if (event.content)` —
 * falsy content omits the key; empty object {} is kept.
 */
describe("vertex-ai convertEvent content falsy omit fourteenth leftover", () => {
	const service = new VertexAiSessionService({ agentEngineId: "9" });
	const convert = (event: Event) => (service as any).convertEventToJson(event);

	it.each([
		{ label: "undefined", content: undefined },
		{ label: "null", content: null },
		{ label: "0", content: 0 },
		{ label: "false", content: false },
		{ label: "empty string", content: "" },
	])("falsy content ($label) omits content key", ({ content }) => {
		const payload = convert(
			new Event({
				author: "agent",
				invocationId: "inv",
				content: content as any,
			}),
		);
		expect(payload).not.toHaveProperty("content");
	});

	it("empty object content is truthy and kept", () => {
		const payload = convert(
			new Event({
				author: "agent",
				invocationId: "inv",
				content: {} as any,
			}),
		);
		expect(payload.content).toEqual({});
	});

	it("populated content is kept (control)", () => {
		const content = { role: "model", parts: [{ text: "hi" }] };
		const payload = convert(
			new Event({
				author: "agent",
				invocationId: "inv",
				content,
			}),
		);
		expect(payload.content).toEqual(content);
	});
});
