import { describe, expect, it } from "vitest";
import { Event } from "../../../events/event";
import {
	AF_FUNCTION_CALL_ID_PREFIX,
	populateClientFunctionCallId,
	removeClientFunctionCallId,
} from "../../../flows/llm-flows/functions";

describe("functions adk- id case / empty leftover (post #168)", () => {
	it("populateClientFunctionCallId regenerates empty-string id via !id", () => {
		const event = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [
					{ functionCall: { name: "a", id: "" } },
					{ functionCall: { name: "b", id: "keep-me" } },
				],
			},
		});
		populateClientFunctionCallId(event);
		const calls = event.getFunctionCalls();
		expect(calls[0].id?.startsWith(AF_FUNCTION_CALL_ID_PREFIX)).toBe(true);
		expect(calls[0].id).not.toBe("");
		expect(calls[1].id).toBe("keep-me");
	});

	it("whitespace-only id is truthy and preserved", () => {
		const event = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "w", id: " " } }],
			},
		});
		populateClientFunctionCallId(event);
		expect(event.getFunctionCalls()[0].id).toBe(" ");
	});

	it.each([
		{ label: "ADK-", id: "ADK-abc" },
		{ label: "Adk-", id: "Adk-xyz" },
		{ label: "AdK-", id: "AdK-1" },
		{ label: "adK-", id: "adK-2" },
	])("removeClientFunctionCallId leaves $label id intact (case-sensitive startsWith)", ({
		id,
	}) => {
		const content = {
			role: "model" as const,
			parts: [
				{ functionCall: { name: "a", id } },
				{
					functionResponse: {
						name: "a",
						id,
						response: {},
					},
				},
			],
		};
		removeClientFunctionCallId(content);
		expect(content.parts[0].functionCall?.id).toBe(id);
		expect(content.parts[1].functionResponse?.id).toBe(id);
	});

	it("exact lowercase adk- prefix is stripped from call and response", () => {
		const content = {
			role: "model" as const,
			parts: [
				{ functionCall: { name: "a", id: "adk-abc" } },
				{
					functionResponse: {
						name: "a",
						id: "adk-xyz",
						response: {},
					},
				},
				{ functionCall: { name: "b", id: "external-1" } },
			],
		};
		removeClientFunctionCallId(content);
		expect(content.parts[0].functionCall?.id).toBeUndefined();
		expect(content.parts[1].functionResponse?.id).toBeUndefined();
		expect(content.parts[2].functionCall?.id).toBe("external-1");
	});
});
