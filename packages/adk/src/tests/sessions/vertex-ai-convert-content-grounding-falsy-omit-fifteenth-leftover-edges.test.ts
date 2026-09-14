import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fifteenth leftover: convertEventToJson `if (event.content)` /
 * `if (event.groundingMetadata)` omit falsy values; "0" / {} kept.
 */
describe("vertex-ai convert content grounding falsy omit fifteenth leftover", () => {
	const service = new VertexAiSessionService({ agentEngineId: "1" });

	it.each([
		0,
		"",
		false,
		null,
	] as const)("content %j omits content key", (content) => {
		const event = new Event({
			author: "agent",
			invocationId: "inv",
			timestamp: 1,
		});
		(event as any).content = content;
		const json = (service as any).convertEventToJson(event);
		expect(json).not.toHaveProperty("content");
	});

	it('content: "0" is included (control truthy string)', () => {
		const event = new Event({
			author: "agent",
			invocationId: "inv",
			timestamp: 1,
		});
		(event as any).content = "0";
		const json = (service as any).convertEventToJson(event);
		expect(json.content).toBe("0");
	});

	it("groundingMetadata {} included; falsy omitted", () => {
		const withMeta = new Event({
			author: "agent",
			invocationId: "inv",
			timestamp: 1,
		});
		(withMeta as any).groundingMetadata = {};
		expect(
			(service as any).convertEventToJson(withMeta).event_metadata
				.grounding_metadata,
		).toEqual({});

		const without = new Event({
			author: "agent",
			invocationId: "inv",
			timestamp: 1,
		});
		(without as any).groundingMetadata = 0;
		expect(
			(service as any).convertEventToJson(without).event_metadata,
		).not.toHaveProperty("grounding_metadata");
	});
});
