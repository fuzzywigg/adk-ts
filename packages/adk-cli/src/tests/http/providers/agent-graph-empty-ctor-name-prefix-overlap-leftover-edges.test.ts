import { describe, expect, it, vi } from "vitest";
import { AgentGraphService } from "../../../http/providers/agent-graph.service";

vi.mock("@nestjs/common", async () => {
	const actual =
		await vi.importActual<typeof import("@nestjs/common")>("@nestjs/common");
	return {
		...actual,
		Logger: class {
			log = vi.fn();
			warn = vi.fn();
			error = vi.fn();
			debug = vi.fn();
		},
	};
});

function makeAgentManager(opts: {
	loaded?: Map<string, unknown>;
	registry?: Map<string, unknown>;
}) {
	return {
		getLoadedAgents: () => opts.loaded ?? new Map(),
		getAgents: () => opts.registry ?? new Map(),
	};
}

/**
 * Leftover: constructor.name "" kept by ??; root vs root2 prefix overlap;
 * subAgents: 0 coerced via || [].
 */
describe("AgentGraphService empty ctor / prefix leftover edges", () => {
	it("keeps empty constructor.name via ?? (does not fall back to BaseAgent)", async () => {
		const agent = {
			name: "empty-ctor",
			subAgents: [],
			async canonicalTools() {
				return [{ name: "t", constructor: { name: "" } }];
			},
		};
		Object.defineProperty(agent, "constructor", {
			value: { name: "" },
		});

		const service = new AgentGraphService(
			makeAgentManager({
				loaded: new Map([["agents/empty", { agent }]]),
			}) as never,
		);
		const graph = await service.getGraph("agents/empty");
		expect(graph.nodes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: "agent:empty-ctor", type: "" }),
				expect.objectContaining({ id: "tool:t", type: "" }),
			]),
		);
	});

	it("does not treat agents/root2 as a child of agents/root", async () => {
		const registry = new Map([
			[
				"agents/root",
				{
					name: "root",
					relativePath: "agents/root",
					absolutePath: "/tmp/agents/root",
				},
			],
			[
				"agents/root2",
				{
					name: "root2",
					relativePath: "agents/root2",
					absolutePath: "/tmp/agents/root2",
				},
			],
			[
				"agents/root/child",
				{
					name: "child",
					relativePath: "agents/root/child",
					absolutePath: "/tmp/agents/root/child",
				},
			],
		]);

		const service = new AgentGraphService(
			makeAgentManager({ registry }) as never,
		);
		const graph = await service.getGraph("agents/root");
		expect(graph.nodes.map((n) => n.id).sort()).toEqual([
			"agent:child",
			"agent:root",
		]);
		expect(graph.nodes.some((n) => n.id === "agent:root2")).toBe(false);
	});

	it("tolerates subAgents: 0 via || [] without throwing", async () => {
		const agent = {
			name: "zero-subs",
			subAgents: 0,
			async canonicalTools() {
				return [];
			},
		};
		Object.defineProperty(agent, "constructor", {
			value: { name: "CustomAgent" },
		});

		const service = new AgentGraphService(
			makeAgentManager({
				loaded: new Map([["agents/zero", { agent }]]),
			}) as never,
		);
		await expect(service.getGraph("agents/zero")).resolves.toEqual({
			nodes: [
				expect.objectContaining({
					id: "agent:zero-subs",
					type: "CustomAgent",
				}),
			],
			edges: [],
		});
	});
});
