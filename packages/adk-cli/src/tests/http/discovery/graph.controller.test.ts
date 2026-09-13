import { describe, expect, it, vi } from "vitest";
import { GraphController } from "../../../http/discovery/graph.controller";

describe("GraphController", () => {
	it("returns graph from service after decoding agent id", async () => {
		const graph = {
			getGraph: vi.fn(async () => ({
				nodes: [{ id: "root" }],
				edges: [],
			})),
		};
		const controller = new GraphController(graph as never);

		await expect(
			controller.getGraph(encodeURIComponent("demo/agent")),
		).resolves.toEqual({
			nodes: [{ id: "root" }],
			edges: [],
		});
		expect(graph.getGraph).toHaveBeenCalledWith("demo/agent");
	});

	it("returns empty graph when service throws", async () => {
		const graph = {
			getGraph: vi.fn(async () => {
				throw new Error("boom");
			}),
		};
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const controller = new GraphController(graph as never);

		await expect(controller.getGraph("broken")).resolves.toEqual({
			nodes: [],
			edges: [],
		});
		error.mockRestore();
	});
});
