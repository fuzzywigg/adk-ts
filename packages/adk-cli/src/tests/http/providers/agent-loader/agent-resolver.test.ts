import { describe, expect, it, vi } from "vitest";
import { AgentResolver } from "../../../../http/providers/agent-loader/agent-resolver";
import { TypeGuards } from "../../../../http/providers/agent-loader/type-guards";

function stubLogger() {
	return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("AgentResolver", () => {
	const guards = new TypeGuards();

	it("resolves a direct agent instance export", async () => {
		const resolver = new AgentResolver(stubLogger() as never, true, guards);
		const agent = { name: "direct", runAsync: async () => undefined };
		await expect(resolver.resolveAgentExport({ agent })).resolves.toBe(agent);
	});

	it("resolves AgentBuilder via build()", async () => {
		const resolver = new AgentResolver(stubLogger() as never, true, guards);
		const agent = { name: "built", runAsync: async () => undefined };
		const builder = {
			build: async () => ({ agent, runner: {}, session: {} }),
			withModel: () => builder,
		};
		await expect(
			resolver.resolveAgentExport({ default: builder }),
		).resolves.toBe(agent);
	});

	it("resolves BuiltAgent shapes and nested .agent objects", async () => {
		const resolver = new AgentResolver(stubLogger() as never, true, guards);
		const agent = { name: "nested", runAsync: async () => undefined };
		await expect(
			resolver.resolveAgentExport({
				default: { agent, runner: {}, session: {} },
			}),
		).resolves.toBe(agent);
	});

	it("scans named createAgent functions", async () => {
		const resolver = new AgentResolver(stubLogger() as never, true, guards);
		const agent = { name: "factory", runAsync: async () => undefined };
		await expect(
			resolver.resolveAgentExport({
				createAgent: async () => agent,
			}),
		).resolves.toBe(agent);
	});

	it("throws a wrapped error when an exported agent function fails", async () => {
		const resolver = new AgentResolver(stubLogger() as never, true, guards);
		await expect(
			resolver.resolveAgentExport({
				default: () => {
					throw new Error("factory boom");
				},
			}),
		).rejects.toThrow(/Failed executing exported agent function: factory boom/);
	});

	it("throws when no agent export can be resolved", async () => {
		const resolver = new AgentResolver(stubLogger() as never, true, guards);
		await expect(
			resolver.resolveAgentExport({ helper: () => 1, value: "x" }),
		).rejects.toThrow(
			/No agent export resolved \(expected BaseAgent, AgentBuilder, or BuiltAgent\)/,
		);
	});
});
