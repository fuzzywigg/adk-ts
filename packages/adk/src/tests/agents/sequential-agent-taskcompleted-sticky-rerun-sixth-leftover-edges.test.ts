import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { LlmAgent } from "../../agents/llm-agent";
import { SequentialAgent } from "../../agents/sequential-agent";
import { Event } from "../../events/event";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";

const mockContext: InvocationContext = {
	invocationId: "sixth-seq-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-seq-sixth",
		userId: "user-seq",
		appName: "app-seq",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	sessionService: {} as BaseSessionService,
	pluginManager: new PluginManager(),
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

/**
 * Sixth leftover: second runLiveImpl must not re-append taskCompleted instruction
 * once the tool name is already present (sticky includes gate).
 */
describe("SequentialAgent taskCompleted sticky rerun sixth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("second runLiveImpl does not re-append instruction or double-inject tool", async () => {
		const llm = new LlmAgent({
			name: "sticky_child",
			model: "gemini-2.5-flash",
			instruction: "base",
		});
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "sticky_child" });
		}) as any;
		const agent = new SequentialAgent({
			name: "sticky_seq",
			description: "d",
			subAgents: [llm],
		});

		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		const afterFirst = String(llm.instruction);
		const toolsAfterFirst = llm.tools.length;
		expect(afterFirst).toMatch(/^baseIf you finished/);
		expect(afterFirst).toContain("taskCompleted");

		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(String(llm.instruction)).toBe(afterFirst);
		expect(llm.tools).toHaveLength(toolsAfterFirst);
		expect(
			llm.tools.filter(
				(t) => (typeof t === "function" ? t.name : t.name) === "taskCompleted",
			),
		).toHaveLength(1);
	});

	it("near-miss tool name still injects once, then sticky on second run", async () => {
		const Named = { name: "TaskCompleted", description: "x" } as any;
		const llm = new LlmAgent({
			name: "near_miss_child",
			model: "gemini-2.5-flash",
			instruction: "seed",
			tools: [Named],
		});
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "near_miss_child" });
		}) as any;
		const agent = new SequentialAgent({
			name: "near_miss_seq",
			description: "d",
			subAgents: [llm],
		});

		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		const afterFirst = String(llm.instruction);
		const toolCount = llm.tools.length;
		expect(toolCount).toBe(2);

		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(String(llm.instruction)).toBe(afterFirst);
		expect(llm.tools).toHaveLength(toolCount);
	});
});
