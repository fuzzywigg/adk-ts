import { describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../../agents/base-agent";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor as agentTransferRequestProcessor } from "../../../flows/llm-flows/agent-transfer";
import { AutoFlow } from "../../../flows/llm-flows/auto-flow";
import { requestProcessor as authRequestProcessor } from "../../../auth/auth-preprocessor";
import { requestProcessor as basicRequestProcessor } from "../../../flows/llm-flows/basic";
import {
	requestProcessor as codeExecutionRequestProcessor,
	responseProcessor as codeExecutionResponseProcessor,
} from "../../../flows/llm-flows/code-execution";
import { requestProcessor as contentRequestProcessor } from "../../../flows/llm-flows/contents";
import { requestProcessor as identityRequestProcessor } from "../../../flows/llm-flows/identity";
import { requestProcessor as instructionsRequestProcessor } from "../../../flows/llm-flows/instructions";
import {
	requestProcessor as nlPlanningRequestProcessor,
	responseProcessor as nlPlanningResponseProcessor,
} from "../../../flows/llm-flows/nl-planning";
import { responseProcessor as outputSchemaResponseProcessor } from "../../../flows/llm-flows/output-schema";
import { sharedMemoryRequestProcessor } from "../../../flows/llm-flows/shared-memory";
import { SingleFlow } from "../../../flows/llm-flows/single-flow";
import { LlmRequest } from "../../../models/llm-request";
import { PluginManager } from "../../../plugins/plugin-manager";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

class StubAgent extends BaseAgent {
	constructor(name: string, description = "") {
		super({ name, description });
	}
}

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events expected */
	}
}

function makeContext(agent: BaseAgent): InvocationContext {
	return {
		agent,
		invocationId: "auto-flow",
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: [],
			lastUpdateTime: 0,
		},
		pluginManager: new PluginManager(),
	} as unknown as InvocationContext;
}

describe("SingleFlow leftover: processor composition order", () => {
	it("registers the exact request processor sequence", () => {
		const flow = new SingleFlow();
		expect(flow.requestProcessors).toEqual([
			basicRequestProcessor,
			authRequestProcessor,
			instructionsRequestProcessor,
			identityRequestProcessor,
			contentRequestProcessor,
			sharedMemoryRequestProcessor,
			nlPlanningRequestProcessor,
			codeExecutionRequestProcessor,
		]);
	});

	it("registers the exact response processor sequence", () => {
		const flow = new SingleFlow();
		expect(flow.responseProcessors).toEqual([
			nlPlanningResponseProcessor,
			outputSchemaResponseProcessor,
			codeExecutionResponseProcessor,
		]);
	});

	it("does not include agent transfer on SingleFlow", () => {
		const flow = new SingleFlow();
		expect(flow.requestProcessors).not.toContain(agentTransferRequestProcessor);
	});
});

describe("AutoFlow leftover: transfer processor append + independence", () => {
	it("appends agent transfer exactly once after SingleFlow prefix", () => {
		const single = new SingleFlow();
		const auto = new AutoFlow();
		expect(auto.requestProcessors.slice(0, -1)).toEqual(
			single.requestProcessors,
		);
		expect(auto.requestProcessors.at(-1)).toBe(agentTransferRequestProcessor);
		expect(
			auto.requestProcessors.filter((p) => p === agentTransferRequestProcessor),
		).toHaveLength(1);
	});

	it("keeps response processors identical to SingleFlow", () => {
		const single = new SingleFlow();
		const auto = new AutoFlow();
		expect(auto.responseProcessors).toEqual(single.responseProcessors);
		expect(auto).toBeInstanceOf(SingleFlow);
	});

	it("mutates only its own processor arrays", () => {
		const a = new AutoFlow();
		const b = new AutoFlow();
		a.requestProcessors.pop();
		expect(a.requestProcessors.length).toBe(b.requestProcessors.length - 1);
		expect(b.requestProcessors.at(-1)).toBe(agentTransferRequestProcessor);
	});
});

describe("AutoFlow leftover: agent-transfer getTransferTargets coalesce matrix", () => {
	it("returns early when subAgents is a non-array object", async () => {
		const request = new LlmRequest();
		const agent = {
			name: "odd",
			subAgents: { not: "array" },
		};
		await drain(
			agentTransferRequestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				request,
			),
		);
		expect(request.config?.systemInstruction).toBeUndefined();
		expect(request.toolsDict.transfer_to_agent).toBeUndefined();
	});

	it("returns early when agent lacks subAgents key", async () => {
		const request = new LlmRequest();
		await drain(
			agentTransferRequestProcessor.runAsync(
				{ agent: { name: "plain" } } as InvocationContext,
				request,
			),
		);
		expect(request.config?.systemInstruction).toBeUndefined();
	});

	const flagMatrix: Array<{
		label: string;
		disallowParent: boolean;
		disallowPeers: boolean;
		expectParentText: boolean;
		expectPeer: boolean;
	}> = [
		{
			label: "both allowed",
			disallowParent: false,
			disallowPeers: false,
			expectParentText: true,
			expectPeer: true,
		},
		{
			label: "parent disallowed",
			disallowParent: true,
			disallowPeers: false,
			expectParentText: false,
			expectPeer: true,
		},
		{
			label: "peers disallowed",
			disallowParent: false,
			disallowPeers: true,
			expectParentText: true,
			expectPeer: false,
		},
		{
			label: "both disallowed",
			disallowParent: true,
			disallowPeers: true,
			expectParentText: false,
			expectPeer: false,
		},
	];

	for (const row of flagMatrix) {
		it(`honors disallow flags: ${row.label}`, async () => {
			const parent = new StubAgent("parent", "Parent agent");
			const peer = new StubAgent("peer", "Peer agent");
			const child = new StubAgent("child", "Child agent");
			const leaf = new StubAgent("leaf", "Leaf only");
			(child as any).disallowTransferToParent = row.disallowParent;
			(child as any).disallowTransferToPeers = row.disallowPeers;
			parent.subAgents = [child, peer];
			child.parentAgent = parent;
			peer.parentAgent = parent;
			child.subAgents = [leaf];

			const request = new LlmRequest();
			await drain(
				agentTransferRequestProcessor.runAsync(makeContext(child), request),
			);
			const text = String(request.config?.systemInstruction || "");
			expect(text).toContain("leaf");
			expect(text).toContain("transfer_to_agent");
			if (row.expectParentText) {
				expect(text).toContain("Your parent agent is parent");
			} else {
				expect(text).not.toContain("Your parent agent is parent");
			}
			if (row.expectPeer) {
				expect(text).toContain("Peer agent");
			} else {
				expect(text).not.toContain("Peer agent");
			}
		});
	}

	it("excludes self from peer list when peers allowed", async () => {
		const parent = new StubAgent("parent", "Parent");
		const peerA = new StubAgent("peer_a", "Peer A");
		const peerB = new StubAgent("peer_b", "Peer B");
		const child = new StubAgent("child", "Child");
		parent.subAgents = [child, peerA, peerB];
		child.parentAgent = parent;
		peerA.parentAgent = parent;
		peerB.parentAgent = parent;
		child.subAgents = [new StubAgent("leaf", "Leaf")];

		const request = new LlmRequest();
		await drain(
			agentTransferRequestProcessor.runAsync(makeContext(child), request),
		);
		const text = String(request.config?.systemInstruction || "");
		expect(text).toContain("peer_a");
		expect(text).toContain("peer_b");
		const childNameHits = text.match(/Agent name: child/g) || [];
		expect(childNameHits.length).toBe(0);
	});

	it("lists only children when parentAgent lacks subAgents", async () => {
		const child = new StubAgent("worker", "Does work");
		const agent = new StubAgent("orchestrator", "Routes");
		agent.subAgents = [child];
		child.parentAgent = agent;
		agent.parentAgent = { name: "bare_parent" } as any;

		const request = new LlmRequest();
		await drain(
			agentTransferRequestProcessor.runAsync(makeContext(agent), request),
		);
		const text = String(request.config?.systemInstruction || "");
		expect(text).toContain("worker");
		expect(text).toContain("Your parent agent is bare_parent");
		expect(text).not.toMatch(/Agent name: bare_parent/);
	});

	it("registers transfer tool via AutoFlow last processor", async () => {
		const auto = new AutoFlow();
		const transfer = auto.requestProcessors.at(-1)!;
		const child = new StubAgent("worker", "Does work");
		const agent = new StubAgent("orchestrator", "Routes");
		agent.subAgents = [child];
		child.parentAgent = agent;

		const request = new LlmRequest();
		await drain(transfer.runAsync(makeContext(agent), request));
		expect(request.toolsDict.transfer_to_agent).toBeDefined();
		expect(request.toolsDict.transfer_to_agent.name).toBe("transfer_to_agent");
	});

	it("skips when subAgents is empty array (no transfer targets)", async () => {
		const agent = new StubAgent("solo");
		agent.subAgents = [];
		const request = new LlmRequest();
		await drain(
			agentTransferRequestProcessor.runAsync(makeContext(agent), request),
		);
		expect(request.config?.systemInstruction).toBeUndefined();
	});

	it("parent-only targets when no children and peers disallowed", async () => {
		const parent = new StubAgent("parent", "Parent agent");
		const child = new StubAgent("child", "Child");
		(child as any).disallowTransferToPeers = true;
		parent.subAgents = [child];
		child.parentAgent = parent;
		child.subAgents = [];

		const request = new LlmRequest();
		await drain(
			agentTransferRequestProcessor.runAsync(makeContext(child), request),
		);
		const text = String(request.config?.systemInstruction || "");
		expect(text).toContain("parent");
		expect(text).toContain("Your parent agent is parent");
	});
});
