import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fourteenth leftover: fromApiEvent reads camelCase action/error/metadata keys
 * only. Snake keys written by convertEventToJson are ignored on readback.
 */
describe("vertex-ai fromApi snake keys ignored fourteenth leftover", () => {
	const service = new VertexAiSessionService({ agentEngineId: "1" });

	it("ignores snake_case actions / errors / event_metadata", () => {
		const event = (service as any).fromApiEvent({
			name: ".../events/e1",
			author: "agent",
			invocationId: "camel-inv",
			timestamp: "2024-01-01T00:00:00.000Z",
			invocation_id: "snake-inv",
			error_code: "SNAKE",
			error_message: "snake-msg",
			errorCode: "CAMEL",
			errorMessage: "camel-msg",
			actions: {
				state_delta: { snake: 1 },
				artifact_delta: { "a.txt": 2 },
				transfer_agent: "snake-child",
				skip_summarization: true,
				requested_auth_configs: { sn: true },
				stateDelta: { camel: 9 },
				transferAgent: "camel-child",
			},
			event_metadata: {
				partial: true,
				turn_complete: true,
				branch: "snake-branch",
			},
			eventMetadata: {
				partial: false,
				turnComplete: false,
				branch: "camel-branch",
			},
		});

		expect(event.invocationId).toBe("camel-inv");
		expect(event.errorCode).toBe("CAMEL");
		expect(event.errorMessage).toBe("camel-msg");
		expect(event.actions.stateDelta).toEqual({ camel: 9 });
		expect(event.actions.artifactDelta).toEqual({});
		expect(event.actions.transferToAgent).toBe("camel-child");
		expect(event.actions.skipSummarization).toBeUndefined();
		expect(event.actions.requestedAuthConfigs).toEqual({});
		expect(event.partial).toBe(false);
		expect(event.turnComplete).toBe(false);
		expect(event.branch).toBe("camel-branch");
	});

	it("convertEventToJson still emits snake_case (write path control)", () => {
		const json = (service as any).convertEventToJson(
			new Event({
				author: "agent",
				invocationId: "inv",
				timestamp: 1,
				actions: {
					stateDelta: { k: 1 },
					transferToAgent: "child",
					skipSummarization: true,
				} as any,
			}),
		);
		expect(json.actions.state_delta).toEqual({ k: 1 });
		expect(json.actions.transfer_agent).toBe("child");
		expect(json.actions.skip_summarization).toBe(true);
		expect(json.actions.stateDelta).toBeUndefined();
	});
});
