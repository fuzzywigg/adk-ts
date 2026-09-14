import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { InMemoryRunner } from "../runners";

/**
 * Eleventh leftover: InMemoryRunner default `appName = "InMemoryRunner"` only
 * applies for undefined. Empty string/null are kept (not coalesced via ||).
 */
describe("InMemoryRunner appName empty default-param eleventh leftover", () => {
	const agent = new LlmAgent({
		name: "root_agent",
		model: "gemini-2.0-flash-exp",
	});

	it("omitted options uses InMemoryRunner", () => {
		expect(new InMemoryRunner(agent).appName).toBe("InMemoryRunner");
	});

	it("empty options object uses InMemoryRunner", () => {
		expect(new InMemoryRunner(agent, {}).appName).toBe("InMemoryRunner");
	});

	it("explicit undefined appName still uses the default parameter", () => {
		expect(new InMemoryRunner(agent, { appName: undefined }).appName).toBe(
			"InMemoryRunner",
		);
	});

	it('empty-string appName is kept (default param does not treat "" as missing)', () => {
		expect(new InMemoryRunner(agent, { appName: "" }).appName).toBe("");
	});

	it("null appName is kept (null is not undefined)", () => {
		expect(new InMemoryRunner(agent, { appName: null as any }).appName).toBe(
			null,
		);
	});
});
