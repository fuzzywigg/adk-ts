import { describe, expect, it } from "vitest";
import { Event } from "../../../events/event";
import {
	AF_FUNCTION_CALL_ID_PREFIX,
	populateClientFunctionCallId,
} from "../../../flows/llm-flows/functions";

/**
 * Fifteenth residual deepen (HEAVY tip-relaunch residual after tip 1f70668 (post #282/#284); supersedes closed #281/#285/#273/#262
 * via `if (!functionCall.id)` and whitespace keep. String `"0"` / `"false"`
 * are truthy so populateClientFunctionCallId preserves them.
 */
describe("functions populate-id string-zero/false keep fifteenth residual deepen", () => {
	it.each([
		{ label: '"0"', id: "0" },
		{ label: '"false"', id: "false" },
	])("preserves truthy string id $label", ({ id }) => {
		const event = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "tool", id } }],
			},
		});
		populateClientFunctionCallId(event);
		expect(event.getFunctionCalls()[0].id).toBe(id);
		expect(
			event.getFunctionCalls()[0].id?.startsWith(AF_FUNCTION_CALL_ID_PREFIX),
		).toBe(false);
	});

	it("empty-string id still regenerates (prior control)", () => {
		const event = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "tool", id: "" } }],
			},
		});
		populateClientFunctionCallId(event);
		expect(
			event.getFunctionCalls()[0].id?.startsWith(AF_FUNCTION_CALL_ID_PREFIX),
		).toBe(true);
	});
});
