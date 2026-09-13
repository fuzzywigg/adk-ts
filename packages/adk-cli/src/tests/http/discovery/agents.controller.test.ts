import { describe, expect, it, vi } from "vitest";
import { AgentsController } from "../../../http/discovery/agents.controller";

describe("AgentsController", () => {
	it("lists discovered agents with mapped fields", () => {
		const agentManager = {
			getAgents: () =>
				new Map([
					[
						"demo",
						{
							name: "demo",
							absolutePath: "/agents/demo",
							relativePath: "demo",
						},
					],
				]),
			scanAgents: vi.fn(),
		};
		const controller = new AgentsController(agentManager as never);
		expect(controller.listAgents()).toEqual({
			agents: [
				{
					path: "/agents/demo",
					name: "demo",
					directory: "/agents/demo",
					relativePath: "demo",
				},
			],
		});
	});

	it("refreshAgents rescans cwd then returns the updated list", () => {
		const agents = new Map();
		const agentManager = {
			getAgents: () => agents,
			scanAgents: vi.fn((dir: string) => {
				expect(dir).toBe(process.cwd());
				agents.set("fresh", {
					name: "fresh",
					absolutePath: "/agents/fresh",
					relativePath: "fresh",
				});
			}),
		};
		const controller = new AgentsController(agentManager as never);
		expect(controller.refreshAgents()).toEqual({
			agents: [
				{
					path: "/agents/fresh",
					name: "fresh",
					directory: "/agents/fresh",
					relativePath: "fresh",
				},
			],
		});
		expect(agentManager.scanAgents).toHaveBeenCalledTimes(1);
	});
});
