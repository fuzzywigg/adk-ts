import { describe, expect, it } from "vitest";
import { resolveAgentExport } from "../../../../http/providers/agent-loader/resolver";

function fakeAgent(name = "demo") {
	return {
		name,
		runAsync: async function* () {},
	};
}

/**
 * Leftover: factory heuristic uses fn.name when export key lacks agent|build|create;
 * empty fn.name short-circuits; CreateAGENT matches keyLower case-insensitively;
 * invokeFunctionSafely only awaits thenables (objects with then).
 */
describe("resolveAgentExport fnName / case / empty leftover edges", () => {
	it("resolves helper export whose function name is createAgent", async () => {
		const agent = fakeAgent("via-fn-name");
		function createAgent() {
			return agent;
		}
		const result = await resolveAgentExport({ helper: createAgent });
		expect(result.agent).toBe(agent);
	});

	it("resolves CreateAGENT key via case-insensitive key regex", async () => {
		const agent = fakeAgent("via-key-case");
		const anon = () => agent;
		Object.defineProperty(anon, "name", { value: "" });
		const result = await resolveAgentExport({ CreateAGENT: anon });
		expect(result.agent).toBe(agent);
	});

	it("skips helper with empty function name (no key/fnName match)", async () => {
		const anon = () => fakeAgent("never");
		Object.defineProperty(anon, "name", { value: "" });
		await expect(resolveAgentExport({ helper: anon })).rejects.toThrow(
			"No agent export resolved",
		);
	});

	it("returns non-thenable falsy factory results without awaiting", async () => {
		await expect(
			resolveAgentExport({
				createAgent: () => 0 as never,
			}),
		).rejects.toThrow("No agent export resolved");

		await expect(
			resolveAgentExport({
				createAgent: () => "" as never,
			}),
		).rejects.toThrow("No agent export resolved");
	});
});
