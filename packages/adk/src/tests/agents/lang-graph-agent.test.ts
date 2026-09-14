import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	LangGraphAgent,
	type LangGraphNode,
} from "../../agents/lang-graph-agent";
import { BaseAgent } from "../../agents/base-agent";
import { Event } from "../../events/event";
import type { InvocationContext } from "../../agents/invocation-context";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	})),
}));

class MockAgent extends BaseAgent {
	public executionCount = 0;
	public errorMode = false;
	public throwValue: unknown = undefined;
	public yieldNothing = false;
	public eventsToYield: Event[] = [];

	constructor(name: string) {
		super({ name, description: `Mock agent ${name}` });
	}

	async *runAsync(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		this.executionCount++;

		if (this.throwValue !== undefined) {
			throw this.throwValue;
		}

		if (this.errorMode) {
			throw new Error(`Error in ${this.name}`);
		}

		if (this.yieldNothing) {
			return;
		}

		for (const event of this.eventsToYield) {
			yield event;
		}

		yield new Event({
			author: this.name,
			content: { parts: [{ text: `Output from ${this.name}` }] },
		});
	}
}

function createMockContext(): InvocationContext {
	return {
		invocationId: "test-invocation",
		agent: {} as BaseAgent,
		branch: [],
		session: {
			id: "ses-123",
			userId: "user-123",
			appName: "test-app",
			state: {},
			events: [],
			lastUpdateTime: 0,
		} as any,
		endInvocation: false,
		createChildContext: vi.fn((agent) => {
			const childContext = createMockContext();
			childContext.agent = agent;
			return childContext;
		}),
	} as unknown as InvocationContext;
}

async function executeGraphAndGetEvents(
	graph: LangGraphAgent,
	context: InvocationContext,
): Promise<Event[]> {
	const events = [];
	for await (const event of graph["runAsyncImpl"](context)) {
		events.push(event);
	}
	return events;
}

describe("LangGraphAgent", () => {
	let mockContext: InvocationContext;
	let agentA: MockAgent;
	let agentB: MockAgent;
	let agentC: MockAgent;
	let nodeA: LangGraphNode;
	let nodeB: LangGraphNode;
	let nodeC: LangGraphNode;

	beforeEach(() => {
		mockContext = createMockContext();
		agentA = new MockAgent("AgentA");
		agentB = new MockAgent("AgentB");
		agentC = new MockAgent("AgentC");
		nodeA = { name: "NodeA", agent: agentA, targets: ["NodeB"] };
		nodeB = { name: "NodeB", agent: agentB, targets: ["NodeC"] };
		nodeC = { name: "NodeC", agent: agentC, targets: [] };
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Constructor", () => {
		it("should initialize with valid configuration", () => {
			const graph = new LangGraphAgent({
				name: "TestGraph",
				description: "Test graph description",
				nodes: [nodeA, nodeB, nodeC],
				rootNode: "NodeA",
			});

			expect(graph.name).toBe("TestGraph");
			expect(graph.description).toBe("Test graph description");
			expect(graph.getRootNodeName()).toBe("NodeA");
			expect(graph.getMaxSteps()).toBe(50);
			expect(graph.getNodes()).toHaveLength(3);
		});

		it("should set custom maxSteps", () => {
			const graph = new LangGraphAgent({
				name: "TestGraph",
				description: "Test graph description",
				nodes: [nodeA, nodeB, nodeC],
				rootNode: "NodeA",
				maxSteps: 10,
			});
			expect(graph.getMaxSteps()).toBe(10);
		});

		it("should throw on duplicate node names", () => {
			const duplicateNode = { ...nodeB, name: "NodeA" };
			expect(
				() =>
					new LangGraphAgent({
						name: "TestGraph",
						description: "Test graph description",
						nodes: [nodeA, duplicateNode, nodeC],
						rootNode: "NodeA",
					}),
			).toThrow("Duplicate node name in graph: NodeA");
		});

		it("should throw if root node is not found", () => {
			expect(
				() =>
					new LangGraphAgent({
						name: "TestGraph",
						description: "Test graph description",
						nodes: [nodeA, nodeB, nodeC],
						rootNode: "NonExistentNode",
					}),
			).toThrow('Root node "NonExistentNode" not found in graph nodes');
		});

		it("should throw if a node targets a non-existent node", () => {
			const badTargetNode = { ...nodeA, targets: ["NonExistentNode"] };
			expect(
				() =>
					new LangGraphAgent({
						name: "TestGraph",
						description: "Test graph description",
						nodes: [badTargetNode, nodeB, nodeC],
						rootNode: "NodeA",
					}),
			).toThrow('Node "NodeA" targets non-existent node "NonExistentNode"');
		});
	});

	describe("Graph Execution", () => {
		it("should execute nodes in sequence for a linear graph", async () => {
			const graph = new LangGraphAgent({
				name: "LinearGraph",
				description: "Linear graph test",
				nodes: [nodeA, nodeB, nodeC],
				rootNode: "NodeA",
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);

			expect(agentA.executionCount).toBe(1);
			expect(agentB.executionCount).toBe(1);
			expect(agentC.executionCount).toBe(1);

			expect(events).toHaveLength(4);
			expect(events[0].author).toBe("AgentA");
			expect(events[1].author).toBe("AgentB");
			expect(events[2].author).toBe("AgentC");

			const completionEvent = events[3];
			expect(completionEvent.author).toBe("LinearGraph");
			expect(completionEvent.content?.parts[0].text).toContain(
				"Graph execution complete",
			);
			expect(completionEvent.content?.parts[0].text).toContain(
				"NodeA → NodeB → NodeC",
			);
		});

		it("should handle conditional branching", async () => {
			const conditionTrue = vi.fn().mockResolvedValue(true);
			const conditionFalse = vi.fn().mockResolvedValue(false);

			const branchNodeA = { ...nodeA, targets: ["BranchB", "BranchC"] };
			const branchNodeB = {
				name: "BranchB",
				agent: agentB,
				targets: [],
				condition: conditionTrue,
			};
			const branchNodeC = {
				name: "BranchC",
				agent: agentC,
				targets: [],
				condition: conditionFalse,
			};

			const graph = new LangGraphAgent({
				name: "BranchGraph",
				description: "Branch graph test",
				nodes: [branchNodeA, branchNodeB, branchNodeC],
				rootNode: "NodeA",
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);

			expect(agentA.executionCount).toBe(1);
			expect(agentB.executionCount).toBe(1);
			expect(agentC.executionCount).toBe(0);

			expect(conditionTrue).toHaveBeenCalledOnce();
			expect(conditionFalse).toHaveBeenCalledOnce();

			const completionEvent = events[events.length - 1];
			expect(completionEvent.content?.parts[0].text).toContain(
				"NodeA → BranchB",
			);
			expect(completionEvent.content?.parts[0].text).not.toContain("BranchC");
		});

		it("should stop at maxSteps to prevent infinite loops", async () => {
			const cycleNodeA = { name: "CycleA", agent: agentA, targets: ["CycleB"] };
			const cycleNodeB = { name: "CycleB", agent: agentB, targets: ["CycleA"] };

			const graph = new LangGraphAgent({
				name: "CyclicGraph",
				description: "Cyclic graph test",
				nodes: [cycleNodeA, cycleNodeB],
				rootNode: "CycleA",
				maxSteps: 5,
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);

			expect(agentA.executionCount + agentB.executionCount).toBe(5);

			const completionEvent = events[events.length - 1];
			expect(completionEvent.content?.parts[0].text).toContain(
				"CycleA → CycleB → CycleA → CycleB → CycleA",
			);
		});

		it("should handle errors in node execution", async () => {
			agentB.errorMode = true;

			const graph = new LangGraphAgent({
				name: "ErrorGraph",
				description: "Error handling test",
				nodes: [nodeA, nodeB, nodeC],
				rootNode: "NodeA",
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);

			expect(agentA.executionCount).toBe(1);
			expect(agentB.executionCount).toBe(1);
			expect(agentC.executionCount).toBe(0);

			expect(events).toHaveLength(2);

			const errorEvent = events[1];
			expect(errorEvent.errorCode).toBe("NODE_EXECUTION_ERROR");
			expect(errorEvent.errorMessage).toBe("Error in AgentB");
			expect(errorEvent.content?.parts[0].text).toContain(
				'Error in node "NodeB"',
			);
		});

		it("should yield an event if no nodes are defined", async () => {
			const dummyNode = {
				name: "dummy",
				agent: new MockAgent("dummy"),
				targets: [],
			};
			const emptyGraph = new LangGraphAgent({
				name: "EmptyGraph",
				description: "Empty graph test",
				nodes: [dummyNode],
				rootNode: "dummy",
			});

			Object.defineProperty(emptyGraph, "nodes", { value: new Map() });

			const events = await executeGraphAndGetEvents(emptyGraph, mockContext);

			expect(events).toHaveLength(1);
			expect(events[0].content?.parts[0].text).toBe(
				"No nodes defined in the graph.",
			);
		});

		it("should yield an event if root node is not found during execution", async () => {
			const graph = new LangGraphAgent({
				name: "MissingRootGraph",
				description: "Missing root test",
				nodes: [nodeA, nodeB, nodeC],
				rootNode: "NodeA",
			});

			Object.defineProperty(graph, "nodes", {
				value: new Map([
					["NodeB", nodeB],
					["NodeC", nodeC],
				]),
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);

			expect(events).toHaveLength(1);
			expect(events[0].content?.parts[0].text).toBe(
				'Root node "NodeA" not found.',
			);
		});
	});

	describe("Helper Methods", () => {
		let graph: LangGraphAgent;

		beforeEach(() => {
			graph = new LangGraphAgent({
				name: "TestGraph",
				description: "Helper methods test",
				nodes: [nodeA, nodeB, nodeC],
				rootNode: "NodeA",
			});
		});

		it("getExecutionResults should return results after execution", async () => {
			expect(graph.getExecutionResults()).toHaveLength(0);
			await executeGraphAndGetEvents(graph, mockContext);
			const results = graph.getExecutionResults();
			expect(results).toHaveLength(3);
			expect(results[0].node).toBe("NodeA");
			expect(results[1].node).toBe("NodeB");
			expect(results[2].node).toBe("NodeC");
		});

		it("clearExecutionHistory should reset results", async () => {
			await executeGraphAndGetEvents(graph, mockContext);
			expect(graph.getExecutionResults()).toHaveLength(3);
			graph.clearExecutionHistory();
			expect(graph.getExecutionResults()).toHaveLength(0);
		});

		it("getNodes should return all graph nodes", () => {
			const nodes = graph.getNodes();
			expect(nodes).toHaveLength(3);
			expect(nodes.map((n) => n.name)).toEqual(["NodeA", "NodeB", "NodeC"]);
		});

		it("getNode should return a specific node or undefined", () => {
			const node = graph.getNode("NodeB");
			expect(node).toBeDefined();
			expect(node?.name).toBe("NodeB");
			expect(node?.agent).toBe(agentB);
			expect(graph.getNode("NonExistentNode")).toBeUndefined();
		});

		it("setMaxSteps should update maxSteps and validate input", () => {
			expect(graph.getMaxSteps()).toBe(50);
			graph.setMaxSteps(20);
			expect(graph.getMaxSteps()).toBe(20);
			expect(() => graph.setMaxSteps(0)).toThrow(
				"maxSteps must be greater than 0",
			);
			expect(() => graph.setMaxSteps(-1)).toThrow(
				"maxSteps must be greater than 0",
			);
		});

		it("getNextNodes should filter based on conditions", async () => {
			const conditionTrue = vi.fn().mockResolvedValue(true);
			const conditionFalse = vi.fn().mockResolvedValue(false);

			const sourceNode = {
				name: "Source",
				agent: agentA,
				targets: ["Target1", "Target2", "Target3"],
			};
			const targetNode1 = { name: "Target1", agent: agentB, targets: [] };
			const targetNode2 = {
				name: "Target2",
				agent: agentB,
				targets: [],
				condition: conditionTrue,
			};
			const targetNode3 = {
				name: "Target3",
				agent: agentC,
				targets: [],
				condition: conditionFalse,
			};

			const testGraph = new LangGraphAgent({
				name: "TestNextNodes",
				description: "Test getNextNodes",
				nodes: [sourceNode, targetNode1, targetNode2, targetNode3],
				rootNode: "Source",
			});

			const lastEvent = new Event({ author: "test" });
			const nextNodes = await testGraph["getNextNodes"](
				sourceNode,
				lastEvent,
				mockContext,
			);

			expect(nextNodes).toHaveLength(2);
			expect(nextNodes.map((n) => n.name)).toContain("Target1");
			expect(nextNodes.map((n) => n.name)).toContain("Target2");
			expect(nextNodes.map((n) => n.name)).not.toContain("Target3");

			expect(conditionTrue).toHaveBeenCalledWith(lastEvent, mockContext);
			expect(conditionFalse).toHaveBeenCalledWith(lastEvent, mockContext);
		});

		it("getNextNodes should return empty array for terminal node", async () => {
			const terminalNode = { name: "Terminal", agent: agentA, targets: [] };
			const testGraph = new LangGraphAgent({
				name: "TestTerminalNode",
				description: "Test terminal node",
				nodes: [terminalNode],
				rootNode: "Terminal",
			});

			const nextNodes = await testGraph["getNextNodes"](
				terminalNode,
				new Event({ author: "test" }),
				mockContext,
			);

			expect(nextNodes).toHaveLength(0);
		});
	});

	describe("runLiveImpl", () => {
		it("should delegate to runAsyncImpl when invoked directly", async () => {
			const graph = new LangGraphAgent({
				name: "LiveGraph",
				description: "Live graph test",
				nodes: [nodeA, nodeB, nodeC],
				rootNode: "NodeA",
			});

			const runAsyncImplSpy = vi.spyOn(graph as any, "runAsyncImpl");
			const liveEvents: Event[] = [];
			for await (const event of graph["runLiveImpl"](mockContext)) {
				liveEvents.push(event);
			}

			expect(runAsyncImplSpy).toHaveBeenCalledOnce();
			expect(runAsyncImplSpy).toHaveBeenCalledWith(mockContext);
			expect(liveEvents.length).toBeGreaterThan(0);
			expect(liveEvents[liveEvents.length - 1].turnComplete).toBe(true);
		});
	});

	describe("Leftover deepen (post #90/#91) — parallel, throws, edges", () => {
		it("executes true parallel fan-out when multiple conditions pass", async () => {
			const branchNodeA = {
				name: "NodeA",
				agent: agentA,
				targets: ["BranchB", "BranchC"],
			};
			const branchNodeB = {
				name: "BranchB",
				agent: agentB,
				targets: [],
				condition: () => true,
			};
			const branchNodeC = {
				name: "BranchC",
				agent: agentC,
				targets: [],
				condition: async () => true,
			};

			const graph = new LangGraphAgent({
				name: "FanOutGraph",
				description: "Parallel fan-out",
				nodes: [branchNodeA, branchNodeB, branchNodeC],
				rootNode: "NodeA",
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);

			expect(agentA.executionCount).toBe(1);
			expect(agentB.executionCount).toBe(1);
			expect(agentC.executionCount).toBe(1);
			expect(events[events.length - 1].content?.parts[0].text).toContain(
				"NodeA → BranchB → BranchC",
			);
		});

		it("stringifies non-Error throws from node agents", async () => {
			const thrower = new MockAgent("StringThrow");
			thrower.throwValue = "plain-string-failure";
			const root = {
				name: "Root",
				agent: thrower,
				targets: [],
			};
			const graph = new LangGraphAgent({
				name: "StringErrorGraph",
				description: "non-Error throw",
				nodes: [root],
				rootNode: "Root",
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);
			expect(events).toHaveLength(1);
			expect(events[0].errorCode).toBe("NODE_EXECUTION_ERROR");
			expect(events[0].errorMessage).toBe("plain-string-failure");
			expect(events[0].content?.parts[0].text).toContain(
				'Error in node "Root": plain-string-failure',
			);
		});

		it("stringifies object throws from node agents", async () => {
			const thrower = new MockAgent("ObjectThrow");
			thrower.throwValue = { code: 42, detail: "boom" };
			const root = {
				name: "Root",
				agent: thrower,
				targets: [],
			};
			const graph = new LangGraphAgent({
				name: "ObjectErrorGraph",
				description: "object throw",
				nodes: [root],
				rootNode: "Root",
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);
			expect(events[0].errorMessage).toBe("[object Object]");
			expect(events[0].content?.parts[0].text).toContain("[object Object]");
		});

		it("skips downstream when a node yields zero events", async () => {
			const silent = new MockAgent("Silent");
			silent.yieldNothing = true;
			const next = new MockAgent("Next");
			const graph = new LangGraphAgent({
				name: "SilentGraph",
				description: "zero events",
				nodes: [
					{ name: "Silent", agent: silent, targets: ["Next"] },
					{ name: "Next", agent: next, targets: [] },
				],
				rootNode: "Silent",
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);
			expect(next.executionCount).toBe(0);
			expect(events).toHaveLength(1);
			expect(events[0].content?.parts[0].text).toContain(
				"Executed nodes: Silent",
			);
			expect(events[0].turnComplete).toBe(true);
		});

		it("treats undefined targets like an empty terminal list", async () => {
			const terminal = {
				name: "Terminal",
				agent: agentA,
				targets: undefined,
			};
			const graph = new LangGraphAgent({
				name: "UndefTargets",
				description: "undefined targets",
				nodes: [terminal],
				rootNode: "Terminal",
			});

			const next = await graph["getNextNodes"](
				terminal,
				new Event({ author: "x" }),
				mockContext,
			);
			expect(next).toEqual([]);

			const events = await executeGraphAndGetEvents(graph, mockContext);
			expect(events[events.length - 1].turnComplete).toBe(true);
		});

		it("populates subAgents from each node agent at construction", () => {
			const graph = new LangGraphAgent({
				name: "SubAgentsGraph",
				description: "subAgents",
				nodes: [nodeA, nodeB, nodeC],
				rootNode: "NodeA",
			});
			expect(graph.subAgents).toEqual([agentA, agentB, agentC]);
		});

		it("getNextNodes logs and skips missing targets after map mutation", async () => {
			const gone = { name: "Gone", agent: agentC, targets: [] };
			const source = {
				name: "Source",
				agent: agentA,
				targets: ["Gone", "StillHere"],
			};
			const stillHere = { name: "StillHere", agent: agentB, targets: [] };
			const graph = new LangGraphAgent({
				name: "MissingTargetGraph",
				description: "missing target continue",
				nodes: [source, gone, stillHere],
				rootNode: "Source",
			});

			(graph as any).nodes.delete("Gone");
			const loggerError = vi.spyOn((graph as any).logger, "error");
			const next = await graph["getNextNodes"](
				source,
				new Event({ author: "x" }),
				mockContext,
			);

			expect(loggerError).toHaveBeenCalledWith('Target node "Gone" not found');
			expect(next.map((n) => n.name)).toEqual(["StillHere"]);
		});

		it("getExecutionResults returns a defensive array copy", async () => {
			const graph = new LangGraphAgent({
				name: "CopyGraph",
				description: "defensive copy",
				nodes: [nodeC],
				rootNode: "NodeC",
			});
			await executeGraphAndGetEvents(graph, mockContext);
			const results = graph.getExecutionResults();
			expect(results).toHaveLength(1);
			results.push({ node: "injected", events: [] });
			expect(graph.getExecutionResults()).toHaveLength(1);
			expect(graph.getExecutionResults()).not.toBe(results);
		});

		it("maxSteps of 1 yields one node then turnComplete completion", async () => {
			const graph = new LangGraphAgent({
				name: "OneStep",
				description: "maxSteps boundary",
				nodes: [nodeA, nodeB, nodeC],
				rootNode: "NodeA",
				maxSteps: 1,
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);
			expect(agentA.executionCount).toBe(1);
			expect(agentB.executionCount).toBe(0);
			expect(events).toHaveLength(2);
			expect(events[0].author).toBe("AgentA");
			expect(events[1].turnComplete).toBe(true);
			expect(events[1].content?.parts[0].text).toContain(
				"Executed nodes: NodeA",
			);
		});

		it("supports sync boolean conditions without Promise wrapping", async () => {
			const syncTrue = vi.fn(() => true);
			const syncFalse = vi.fn(() => false);
			const root = {
				name: "Root",
				agent: agentA,
				targets: ["Yes", "No"],
			};
			const yes = {
				name: "Yes",
				agent: agentB,
				targets: [],
				condition: syncTrue,
			};
			const no = {
				name: "No",
				agent: agentC,
				targets: [],
				condition: syncFalse,
			};

			const graph = new LangGraphAgent({
				name: "SyncCond",
				description: "sync conditions",
				nodes: [root, yes, no],
				rootNode: "Root",
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);
			expect(syncTrue).toHaveBeenCalledOnce();
			expect(syncFalse).toHaveBeenCalledOnce();
			expect(agentB.executionCount).toBe(1);
			expect(agentC.executionCount).toBe(0);
			expect(events[events.length - 1].content?.parts[0].text).toContain(
				"Root → Yes",
			);
		});

		it("records custom events yielded by a node before its default output", async () => {
			agentA.eventsToYield = [
				new Event({
					author: "AgentA",
					content: { parts: [{ text: "preamble" }] },
				}),
			];
			const graph = new LangGraphAgent({
				name: "CustomEvents",
				description: "custom yield",
				nodes: [{ name: "Only", agent: agentA, targets: [] }],
				rootNode: "Only",
			});

			const events = await executeGraphAndGetEvents(graph, mockContext);
			expect(events[0].content?.parts[0].text).toBe("preamble");
			expect(events[1].content?.parts[0].text).toBe("Output from AgentA");
			const results = graph.getExecutionResults();
			expect(results[0].events).toHaveLength(2);
		});
	});
});
