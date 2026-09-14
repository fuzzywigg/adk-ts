import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover: `_isTransferableAcrossAgentTree` disallow truthiness
 * residual after fifth — `"true"`/`[]`/`1` block; `-0`/`""` still allow.
 */
describe("runners disallowTransfer string-true/empty-array fourteenth leftover", () => {
	function makeRunner(disallow: unknown) {
		const child = new LlmAgent({
			name: "child",
			model: "gemini-2.0-flash-exp",
		});
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		(child as any).disallowTransferToParent = disallow;
		return {
			runner: new Runner({
				appName: "runner-app14",
				agent: root,
				sessionService: new InMemorySessionService(),
			}),
			child,
		};
	}

	it.each([
		{ label: "string-true", value: "true" },
		{ label: "empty-array", value: [] },
		{ label: "1", value: 1 },
	])("disallowTransferToParent=$label makes agent non-transferable", ({
		value,
	}) => {
		const { runner, child } = makeRunner(value);
		expect((runner as any)._isTransferableAcrossAgentTree(child)).toBe(false);
	});

	it.each([
		{ label: "-0", value: -0 },
		{ label: "empty-string", value: "" },
	])("disallowTransferToParent=$label remains transferable", ({ value }) => {
		const { runner, child } = makeRunner(value);
		expect((runner as any)._isTransferableAcrossAgentTree(child)).toBe(true);
	});
});
