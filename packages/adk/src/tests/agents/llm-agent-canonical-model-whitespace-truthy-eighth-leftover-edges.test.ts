import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { LLMRegistry } from "../../models/llm-registry";

/**
 * Eighth leftover: canonicalModel `if (typeof model === "string") { if (this.model) … }`.
 * Empty string walks ancestors; whitespace " " / "0" are truthy and hit registry.
 */
describe("LlmAgent canonicalModel whitespace truthy eighth leftover", () => {
	it.each([
		{ label: "single space", model: " " },
		{ label: "tab", model: "\t" },
		{ label: '"0"', model: "0" },
	])("$label model is truthy and resolves via LLMRegistry", ({ model }) => {
		const spy = vi
			.spyOn(LLMRegistry, "newLLM")
			.mockReturnValue({ model } as any);
		const agent = new LlmAgent({ name: "ws_canon", model });
		expect(agent.canonicalModel).toEqual({ model });
		expect(spy).toHaveBeenCalledWith(model);
		spy.mockRestore();
	});

	it("empty model still walks ancestors (control vs whitespace)", () => {
		const spy = vi
			.spyOn(LLMRegistry, "newLLM")
			.mockReturnValue({ model: "parent" } as any);
		const parent = new LlmAgent({ name: "parent", model: "parent" });
		const child = new LlmAgent({ name: "child", model: "" });
		(child as any).parentAgent = parent;
		expect(child.canonicalModel).toEqual({ model: "parent" });
		expect(spy).toHaveBeenCalledWith("parent");
		spy.mockRestore();
	});
});
