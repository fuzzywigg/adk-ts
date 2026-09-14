import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { InMemoryRunner } from "../runners";

/**
 * Nineteenth leftover (runners residual): InMemoryRunner default-param
 * `appName = "InMemoryRunner"` — 0/false/"0" are kept (eleventh only ""/null).
 */
describe("InMemoryRunner appName zero/false/string nineteenth leftover", () => {
	const agent = new LlmAgent({
		name: "root_agent",
		model: "gemini-2.0-flash-exp",
	});

	it("numeric 0 appName is kept", () => {
		expect(new InMemoryRunner(agent, { appName: 0 as any }).appName).toBe(0);
	});

	it("false appName is kept", () => {
		expect(new InMemoryRunner(agent, { appName: false as any }).appName).toBe(
			false,
		);
	});

	it('string "0" appName is kept', () => {
		expect(new InMemoryRunner(agent, { appName: "0" }).appName).toBe("0");
	});
});
