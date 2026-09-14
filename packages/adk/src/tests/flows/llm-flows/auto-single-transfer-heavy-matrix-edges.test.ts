import { describe, expect, it, vi } from "vitest";
import { AutoFlow, SingleFlow } from "@adk/flows";
import { BaseAgent } from "../../../agents/base-agent";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor as authRequestProcessor } from "../../../auth/auth-preprocessor";
import { requestProcessor as agentTransferRequestProcessor } from "../../../flows/llm-flows/agent-transfer";
import { requestProcessor as basicRequestProcessor } from "../../../flows/llm-flows/basic";
import { requestProcessor as identityRequestProcessor } from "../../../flows/llm-flows/identity";
import {
	basicRequestProcessor as basicFromIndex,
	codeExecutionRequestProcessor,
	codeExecutionResponseProcessor,
	contentRequestProcessor,
	identityRequestProcessor as identityFromIndex,
	instructionsRequestProcessor,
	nlPlanningRequestProcessor,
	nlPlanningResponseProcessor,
	SingleFlow as SingleFlowFromIndex,
} from "../../../flows/llm-flows";
import { responseProcessor as outputSchemaResponseProcessor } from "../../../flows/llm-flows/output-schema";
import { sharedMemoryRequestProcessor } from "../../../flows/llm-flows/shared-memory";
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

vi.mock("@adk/logger", () => ({
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

function makeTransferContext(agent: BaseAgent): InvocationContext {
	return {
		agent,
		invocationId: "e-transfer",
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

async function collect(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events expected */
	}
}

describe("AutoFlow / SingleFlow heavy matrix", () => {
	it("AutoFlow has one more request processor than SingleFlow", () => {
		const single = new SingleFlow();
		const auto = new AutoFlow();
		expect(auto.requestProcessors.length).toBe(
			single.requestProcessors.length + 1,
		);
		expect(auto.responseProcessors.length).toBe(
			single.responseProcessors.length,
		);
	});

	it("AutoFlow last request processor is agent transfer", () => {
		const auto = new AutoFlow();
		expect(auto.requestProcessors.at(-1)).toBe(agentTransferRequestProcessor);
	});

	it("AutoFlow preserves SingleFlow prefix order", () => {
		const single = new SingleFlow();
		const auto = new AutoFlow();
		expect(auto.requestProcessors.slice(0, -1)).toEqual(
			single.requestProcessors,
		);
	});

	it("creates independent processor arrays per AutoFlow instance", () => {
		const a = new AutoFlow();
		const b = new AutoFlow();
		expect(a.requestProcessors).not.toBe(b.requestProcessors);
		expect(a.requestProcessors).toHaveLength(b.requestProcessors.length);
	});

	it("AutoFlow extends SingleFlow", () => {
		expect(new AutoFlow()).toBeInstanceOf(SingleFlow);
	});

	it("agent transfer appears exactly once on AutoFlow", () => {
		const auto = new AutoFlow();
		expect(
			auto.requestProcessors.filter((p) => p === agentTransferRequestProcessor)
				.length,
		).toBe(1);
	});

	it("SingleFlow registers expected request processors", () => {
		const flow = new SingleFlowFromIndex();
		expect(flow.requestProcessors).toHaveLength(8);
		expect(flow.requestProcessors[0]).toBe(basicFromIndex);
		expect(flow.requestProcessors[1]).toBe(authRequestProcessor);
		expect(flow.requestProcessors[2]).toBe(instructionsRequestProcessor);
		expect(flow.requestProcessors[3]).toBe(identityFromIndex);
		expect(flow.requestProcessors[4]).toBe(contentRequestProcessor);
		expect(flow.requestProcessors[5]).toBe(sharedMemoryRequestProcessor);
		expect(flow.requestProcessors[6]).toBe(nlPlanningRequestProcessor);
		expect(flow.requestProcessors[7]).toBe(codeExecutionRequestProcessor);
	});

	it("SingleFlow registers expected response processors", () => {
		const flow = new SingleFlowFromIndex();
		expect(flow.responseProcessors).toEqual([
			nlPlanningResponseProcessor,
			outputSchemaResponseProcessor,
			codeExecutionResponseProcessor,
		]);
	});

	it("SingleFlow instances share equal but distinct arrays", () => {
		const a = new SingleFlow();
		const b = new SingleFlow();
		expect(a.requestProcessors).not.toBe(b.requestProcessors);
		expect(a.requestProcessors).toEqual(b.requestProcessors);
		expect(a.responseProcessors).not.toBe(b.responseProcessors);
		expect(a.responseProcessors).toEqual(b.responseProcessors);
	});

	it("auth preprocessor sits before instructions on SingleFlow", () => {
		const flow = new SingleFlow();
		expect(flow.requestProcessors.indexOf(authRequestProcessor)).toBeLessThan(
			flow.requestProcessors.indexOf(instructionsRequestProcessor),
		);
	});
});

describe("agent-transfer heavy matrix", () => {
	it("skips agents without subAgents", async () => {
		const request = new LlmRequest();
		await drain(
			agentTransferRequestProcessor.runAsync(
				{ agent: { name: "plain" } } as InvocationContext,
				request,
			),
		);
		expect(request.config?.systemInstruction).toBeUndefined();
	});

	it("skips when there are no transfer targets", async () => {
		const request = new LlmRequest();
		await drain(
			agentTransferRequestProcessor.runAsync(
				makeTransferContext(new StubAgent("solo")),
				request,
			),
		);
		expect(request.config?.systemInstruction).toBeUndefined();
	});

	it("adds transfer instructions for sub-agents", async () => {
		const request = new LlmRequest();
		const child = new StubAgent("worker", "Does work");
		const agent = new StubAgent("orchestrator", "Routes work");
		agent.subAgents = [child];
		child.parentAgent = agent;
		await drain(
			agentTransferRequestProcessor.runAsync(
				makeTransferContext(agent),
				request,
			),
		);
		expect(request.config?.systemInstruction).toContain("transfer_to_agent");
		expect(request.config?.systemInstruction).toContain("worker");
	});

	it("registers transfer_to_agent tool", async () => {
		const request = new LlmRequest();
		const child = new StubAgent("worker", "Does work");
		const agent = new StubAgent("orchestrator", "Routes");
		agent.subAgents = [child];
		child.parentAgent = agent;
		await drain(
			agentTransferRequestProcessor.runAsync(
				makeTransferContext(agent),
				request,
			),
		);
		expect(request.toolsDict.transfer_to_agent).toBeDefined();
	});

	it("honors disallowTransferToParent and disallowTransferToPeers", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const peer = new StubAgent("peer", "Peer");
		const agent = new StubAgent("child", "Child");
		(agent as any).disallowTransferToParent = true;
		(agent as any).disallowTransferToPeers = true;
		parent.subAgents = [agent, peer];
		agent.parentAgent = parent;
		peer.parentAgent = parent;
		agent.subAgents = [new StubAgent("leaf", "Leaf")];
		await drain(
			agentTransferRequestProcessor.runAsync(
				makeTransferContext(agent),
				request,
			),
		);
		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).toContain("leaf");
		expect(instruction).not.toContain("Your parent agent is parent");
		expect(instruction).not.toContain("Peer");
	});

	it("mentions parent and peers when transfers allowed", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent agent");
		const peer = new StubAgent("peer", "Peer agent");
		const agent = new StubAgent("child", "Child");
		parent.subAgents = [agent, peer];
		agent.parentAgent = parent;
		peer.parentAgent = parent;
		await drain(
			agentTransferRequestProcessor.runAsync(
				makeTransferContext(agent),
				request,
			),
		);
		expect(request.config?.systemInstruction).toContain("peer");
		expect(request.config?.systemInstruction).toContain(
			"Your parent agent is parent",
		);
	});

	it("yields no events", async () => {
		const request = new LlmRequest();
		const child = new StubAgent("worker", "Does work");
		const agent = new StubAgent("orchestrator", "Routes");
		agent.subAgents = [child];
		child.parentAgent = agent;
		expect(
			await collect(
				agentTransferRequestProcessor.runAsync(
					makeTransferContext(agent),
					request,
				),
			),
		).toEqual([]);
	});

	it("appends without replacing existing systemInstruction", async () => {
		const request = new LlmRequest();
		request.config = { systemInstruction: "Existing." };
		const child = new StubAgent("worker", "Does work");
		const agent = new StubAgent("orchestrator", "Routes");
		agent.subAgents = [child];
		child.parentAgent = agent;
		await drain(
			agentTransferRequestProcessor.runAsync(
				makeTransferContext(agent),
				request,
			),
		);
		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).toContain("Existing.");
		expect(instruction).toContain("transfer_to_agent");
	});
});

describe("identity heavy matrix", () => {
	it.each([
		["researcher", undefined],
		["coder", "Writes TypeScript"],
		["blank", ""],
		["agent_v2", "v2"],
	])("appends identity for name=%s description=%j", async (name, description) => {
		const llmRequest = new LlmRequest();
		await collect(
			identityRequestProcessor.runAsync(
				{
					agent: { name, description },
				} as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain(`Your internal name is "${name}"`);
		if (description) {
			expect(text).toContain(`The description about you is "${description}"`);
		} else {
			expect(text).not.toContain("The description about you");
		}
	});

	it("appends after existing system instructions", async () => {
		const llmRequest = new LlmRequest();
		llmRequest.appendInstructions(["Be concise."]);
		await collect(
			identityRequestProcessor.runAsync(
				{ agent: { name: "helper" } } as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text.startsWith("Be concise.")).toBe(true);
		expect(text).toContain('Your internal name is "helper"');
	});

	it("yields no events", async () => {
		expect(
			await collect(
				identityRequestProcessor.runAsync(
					{ agent: { name: "silent" } } as InvocationContext,
					new LlmRequest(),
				),
			),
		).toEqual([]);
	});
});

describe("basic requestProcessor heavy matrix", () => {
	it("skips non-LlmAgent agents", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			basicRequestProcessor.runAsync(
				{ agent: { name: "plain" }, runConfig: {} } as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.model).toBeUndefined();
	});

	it("sets model from string canonicalModel and copies config", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			basicRequestProcessor.runAsync(
				{
					agent: {
						name: "llm-agent",
						canonicalModel: "gpt-4o",
						generateContentConfig: { temperature: 0.2 },
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.model).toBe("gpt-4o");
		expect(llmRequest.config).toEqual({ temperature: 0.2 });
	});

	it("reads model from object canonicalModel", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			basicRequestProcessor.runAsync(
				{
					agent: {
						name: "llm-agent",
						canonicalModel: { model: "gemini-2.5-flash" },
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.model).toBe("gemini-2.5-flash");
	});

	it("sets output schema when no tools or transfers", async () => {
		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		await drain(
			basicRequestProcessor.runAsync(
				{
					agent: {
						name: "schema-agent",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [],
						subAgents: [],
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBe(schema);
		expect(llmRequest.config?.responseMimeType).toBe("application/json");
	});

	it("skips output schema when tools present", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			basicRequestProcessor.runAsync(
				{
					agent: {
						name: "tool-agent",
						canonicalModel: "gpt-4o",
						outputSchema: { type: "object" },
						canonicalTools: async () => [{ name: "search" }],
						subAgents: [],
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBeUndefined();
	});

	it("skips output schema when transferable sub-agents exist", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			basicRequestProcessor.runAsync(
				{
					agent: {
						name: "transfer-agent",
						canonicalModel: "gpt-4o",
						outputSchema: { type: "object" },
						canonicalTools: async () => [],
						subAgents: [{ name: "child" }],
						disallowTransferToParent: false,
						disallowTransferToPeers: false,
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBeUndefined();
	});

	it("sets output schema when transfers fully disallowed", async () => {
		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		await drain(
			basicRequestProcessor.runAsync(
				{
					agent: {
						name: "locked",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [],
						subAgents: [{ name: "child" }],
						disallowTransferToParent: true,
						disallowTransferToPeers: true,
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBe(schema);
	});

	it("copies live connect settings from runConfig", async () => {
		const llmRequest = new LlmRequest();
		const speechConfig = { voiceConfig: { prebuiltVoiceConfig: {} } };
		await drain(
			basicRequestProcessor.runAsync(
				{
					agent: { name: "live-agent", canonicalModel: "gpt-4o" },
					runConfig: {
						responseModalities: ["AUDIO"],
						speechConfig,
						enableAffectiveDialog: true,
						proactivity: { proactiveAudio: true },
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.liveConnectConfig.responseModalities).toEqual(["AUDIO"]);
		expect(llmRequest.liveConnectConfig.speechConfig).toBe(speechConfig);
		expect(llmRequest.liveConnectConfig.enableAffectiveDialog).toBe(true);
	});
});
