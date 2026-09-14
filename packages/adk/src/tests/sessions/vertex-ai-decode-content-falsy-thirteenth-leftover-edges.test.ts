import { describe, expect, it } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Thirteenth leftover: decodeContent/decodeGroundingMetadata use `if (!content)`
 * so ""/0/null/undefined become undefined; {} and "0" are kept.
 */
describe("vertex-ai decodeContent/grounding falsy thirteenth leftover edges", () => {
	const service = new VertexAiSessionService({ agentEngineId: "1" });
	const decodeContent = (service as any).decodeContent.bind(service);
	const decodeGrounding = (service as any).decodeGroundingMetadata.bind(
		service,
	);

	it.each([
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: "empty string", value: "" },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
	])("decodeContent $label → undefined", ({ value }) => {
		expect(decodeContent(value)).toBeUndefined();
	});

	it.each([
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: "empty string", value: "" },
		{ label: "0", value: 0 },
	])("decodeGroundingMetadata $label → undefined", ({ value }) => {
		expect(decodeGrounding(value)).toBeUndefined();
	});

	it('keeps truthy empty object and string "0"', () => {
		expect(decodeContent({})).toEqual({});
		expect(decodeContent("0")).toBe("0");
		expect(decodeGrounding({ chunks: [] })).toEqual({ chunks: [] });
	});
});
