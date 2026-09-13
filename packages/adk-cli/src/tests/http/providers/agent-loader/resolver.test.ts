import { describe, expect, it } from "vitest";
import { resolveAgentExport } from "../../../../http/providers/agent-loader/resolver";

function fakeAgent(name = "demo") {
	return {
		name,
		runAsync: async function* () {},
	};
}

describe("resolveAgentExport", () => {
	it("resolves mod.agent instances", async () => {
		const agent = fakeAgent("direct");
		const result = await resolveAgentExport({ agent });
		expect(result.agent).toBe(agent);
	});

	it("resolves default.agent containers", async () => {
		const agent = fakeAgent("defaulted");
		const result = await resolveAgentExport({
			default: { agent },
		});
		expect(result.agent).toBe(agent);
	});

	it("resolves AgentBuilder via build()", async () => {
		const agent = fakeAgent("built");
		const built = { agent, runner: {}, session: {} };
		const result = await resolveAgentExport({
			default: {
				build: async () => built,
				withModel: () => ({}),
			},
		});
		expect(result.agent).toBe(agent);
		expect(result.builtAgent).toBe(built);
	});

	it("resolves BuiltAgent exports", async () => {
		const agent = fakeAgent("packaged");
		const built = { agent, runner: {}, session: {} };
		const result = await resolveAgentExport({ demo: built });
		expect(result.agent).toBe(agent);
		expect(result.builtAgent).toBe(built);
	});

	it("resolves named createAgent factories", async () => {
		const agent = fakeAgent("factory");
		const result = await resolveAgentExport({
			createAgent: () => agent,
		});
		expect(result.agent).toBe(agent);
	});

	it("resolves async factories that return containers", async () => {
		const agent = fakeAgent("async");
		const result = await resolveAgentExport({
			buildAgent: async () => ({ agent }),
		});
		expect(result.agent).toBe(agent);
	});

	it("throws when nothing resolvable is exported", async () => {
		await expect(resolveAgentExport({ helper: () => 1 })).rejects.toThrow(
			"No agent export resolved",
		);
	});

	it("rethrows failures from direct function candidates", async () => {
		async function createAgent() {
			throw new Error("factory exploded");
		}

		await expect(
			resolveAgentExport({
				agent: createAgent,
			}),
		).rejects.toThrow(/Failed executing exported agent function/);
	});
});
