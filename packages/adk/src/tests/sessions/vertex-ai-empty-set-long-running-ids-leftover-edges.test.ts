import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Leftover: empty Set is truthy → Array.from → [] not null;
 * omitted/undefined → null.
 */
describe("vertex-ai empty-set longRunningToolIds leftover edges", () => {
	const service = new VertexAiSessionService({ agentEngineId: "1" });
	const convert = (event: Event) => (service as any).convertEventToJson(event);

	it("empty Set serializes to [] not null", () => {
		const payload = convert(
			new Event({
				author: "agent",
				invocationId: "inv",
				timestamp: 10,
				longRunningToolIds: new Set(),
			}),
		);
		expect(payload.event_metadata.long_running_tool_ids).toEqual([]);
	});

	it.each([
		{ label: "undefined", ids: undefined },
		{ label: "omitted", ids: Symbol.for("omit") },
	])("falsy/absent longRunningToolIds → null ($label)", ({ ids }) => {
		const init: any = {
			author: "agent",
			invocationId: "inv",
			timestamp: 10,
		};
		if (ids !== Symbol.for("omit")) {
			init.longRunningToolIds = ids;
		}
		const payload = convert(new Event(init));
		expect(payload.event_metadata.long_running_tool_ids).toBeNull();
	});

	it("populated Set serializes to array (control)", () => {
		const payload = convert(
			new Event({
				author: "agent",
				invocationId: "inv",
				timestamp: 10,
				longRunningToolIds: new Set(["a", "b"]),
			}),
		);
		expect(new Set(payload.event_metadata.long_running_tool_ids)).toEqual(
			new Set(["a", "b"]),
		);
	});

	it("fromApi empty list → empty Set; roundtrip convert → []", () => {
		const fromApi = (service as any).fromApiEvent.bind(service);
		const event = fromApi({
			name: "projects/p/locations/l/reasoningEngines/1/sessions/s/events/e1",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:10.000Z",
			eventMetadata: {
				longRunningToolIds: [],
			},
		});
		expect(event.longRunningToolIds).toEqual(new Set());
		const payload = convert(event);
		expect(payload.event_metadata.long_running_tool_ids).toEqual([]);
	});

	it("fromApi missing longRunningToolIds → undefined → convert null", () => {
		const fromApi = (service as any).fromApiEvent.bind(service);
		const event = fromApi({
			name: ".../events/e2",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:10.000Z",
			eventMetadata: {
				partial: false,
			},
		});
		expect(event.longRunningToolIds).toBeUndefined();
		expect(convert(event).event_metadata.long_running_tool_ids).toBeNull();
	});
});
