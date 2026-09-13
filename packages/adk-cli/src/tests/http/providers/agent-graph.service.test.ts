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
	loaded?: Map<string, any>;
	registry?: Map<string, any>;
}) {
	return {
		getLoadedAgents: () => opts.loaded ?? new Map(),
		getAgents: () => opts.registry ?? new Map(),
	};
}

describe("AgentGraphService", () => {
	it("returns an empty graph for unknown agent paths", async () => {
		const service = new AgentGraphService(makeAgentManager({}) as any);
		await expect(service.getGraph("missing")).resolves.toEqual({
			nodes: [],
			edges: [],
		});
	});

	it("builds nodes and edges from a loaded agent tree", async () => {
		class LlmAgent {
			name = "parent";
			subAgents = [new SequentialAgent()];
			async canonicalTools() {
				return [{ name: "search", constructor: { name: "FunctionTool" } }];
			}
		}
		class SequentialAgent {
			name = "child";
			subAgents = [];
			constructor() {
				Object.defineProperty(this, "constructor", {
					value: { name: "SequentialAgent" },
				});
			}
		}
		Object.defineProperty(LlmAgent.prototype, "constructor", {
			value: { name: "LlmAgent" },
		});

		const parent = new LlmAgent();
		Object.defineProperty(parent, "constructor", {
			value: { name: "LlmAgent" },
		});

		const service = new AgentGraphService(
			makeAgentManager({
				loaded: new Map([["agents/demo", { agent: parent }]]),
			}) as any,
		);

		const graph = await service.getGraph("agents/demo");

		expect(graph.nodes.map((n) => n.id).sort()).toEqual([
			"agent:child",
			"agent:parent",
			"tool:search",
		]);
		expect(graph.edges).toEqual(
			expect.arrayContaining([
				{ from: "agent:parent", to: "agent:child" },
				{ from: "agent:parent", to: "tool:search" },
			]),
		);
		expect(graph.nodes.find((n) => n.id === "agent:parent")?.type).toBe(
			"LlmAgent",
		);
		expect(graph.nodes.find((n) => n.id === "agent:child")?.group).toBe(
			"sequential",
		);
	});

	it("falls back to registry parent/child edges without an instance", async () => {
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
				"agents/root/child",
				{
					name: "child",
					relativePath: "agents/root/child",
					absolutePath: "/tmp/agents/root/child",
				},
			],
		]);

		const service = new AgentGraphService(
			makeAgentManager({ registry }) as any,
		);
		const graph = await service.getGraph("agents/root");

		expect(graph.nodes.map((n) => n.id)).toEqual(["agent:root", "agent:child"]);
		expect(graph.edges).toEqual([{ from: "agent:root", to: "agent:child" }]);
	});

	it("continues when canonicalTools throws", async () => {
		const agent = {
			name: "solo",
			subAgents: [],
			canonicalTools: async () => {
				throw new Error("tools unavailable");
			},
		};
		Object.defineProperty(agent, "constructor", {
			value: { name: "ParallelAgent" },
		});

		const service = new AgentGraphService(
			makeAgentManager({
				loaded: new Map([["agents/solo", { agent }]]),
			}) as any,
		);

		const graph = await service.getGraph("agents/solo");
		expect(graph.nodes).toHaveLength(1);
		expect(graph.nodes[0].type).toBe("ParallelAgent");
		expect(graph.edges).toEqual([]);
	});
});
