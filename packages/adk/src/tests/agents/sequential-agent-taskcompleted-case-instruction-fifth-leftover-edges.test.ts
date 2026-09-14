import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { LlmAgent } from "../../agents/llm-agent";
import { SequentialAgent } from "../../agents/sequential-agent";
import { Event } from "../../events/event";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import { BaseTool } from "../../tools/base/base-tool";

class MockSubAgent extends BaseAgent {
	runAsync = vi.fn();
	runLive = vi.fn();

	constructor(name: string) {
		super({ name, description: "" });
	}
}

class NamedTool extends BaseTool {
	constructor(name: string) {
		super({ name, description: "named" });
	}

	async runAsync(): Promise<any> {
		return "ok";
	}
}

const mockContext: InvocationContext = {
	invocationId: "fifth-seq-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-seq-fifth",
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

describe("SequentialAgent fifth leftover — taskCompleted name case sensitivity", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const nearMissNames = [
		"TaskCompleted",
		"task_completed",
		"TASKCOMPLETED",
		"taskcompleted",
	];

	for (const nearMiss of nearMissNames) {
		it(`double-injects when existing tool is named ${nearMiss} (case-sensitive includes)`, async () => {
			const llm = new LlmAgent({
				name: "case_child",
				model: "gemini-2.5-flash",
				instruction: "base",
				tools: [new NamedTool(nearMiss)],
			});
			llm.runLive = vi.fn(async function* () {
				yield new Event({ author: "case_child" });
			}) as any;
			const agent = new SequentialAgent({
				name: "case_seq",
				description: "d",
				subAgents: [llm],
			});
			for await (const _ of agent["runLiveImpl"](mockContext)) {
			}
			const toolNames = llm.tools.map((t) =>
				typeof t === "function" ? t.name : t.name,
			);
			expect(toolNames).toContain(nearMiss);
			expect(toolNames).toContain("taskCompleted");
			expect(
				toolNames.filter((n) => n === "taskCompleted" || n === nearMiss),
			).toHaveLength(2);
		});
	}

	it("does not double-inject when exact taskCompleted function already present", async () => {
		function taskCompleted(): string {
			return "already";
		}
		const llm = new LlmAgent({
			name: "exact_child",
			model: "gemini-2.5-flash",
			instruction: "base",
			tools: [taskCompleted],
		});
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "exact_child" });
		}) as any;
		const before = llm.tools.length;
		const agent = new SequentialAgent({
			name: "exact_seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(llm.tools).toHaveLength(before);
		expect(
			llm.tools.filter(
				(t) => (typeof t === "function" ? t.name : t.name) === "taskCompleted",
			),
		).toHaveLength(1);
	});
});

describe("SequentialAgent fifth leftover — instruction nullish coercion", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("coerces undefined instruction to string 'undefined' + append when injecting", async () => {
		const llm = new LlmAgent({
			name: "undef_instr",
			model: "gemini-2.5-flash",
		});
		(llm as { instruction: unknown }).instruction = undefined;
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "undef_instr" });
		}) as any;
		const agent = new SequentialAgent({
			name: "undef_seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(String(llm.instruction)).toMatch(/^undefinedIf you finished/);
		expect(String(llm.instruction)).toContain("taskCompleted");
	});

	it("coerces null instruction to string 'null' + append when injecting", async () => {
		const llm = new LlmAgent({
			name: "null_instr",
			model: "gemini-2.5-flash",
			instruction: "will-overwrite",
		});
		(llm as { instruction: unknown }).instruction = null;
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "null_instr" });
		}) as any;
		const agent = new SequentialAgent({
			name: "null_seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(String(llm.instruction)).toMatch(/^nullIf you finished/);
	});

	it("appends onto empty-string instruction without inventing undefined prefix", async () => {
		const llm = new LlmAgent({
			name: "empty_instr",
			model: "gemini-2.5-flash",
			instruction: "",
		});
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "empty_instr" });
		}) as any;
		const agent = new SequentialAgent({
			name: "empty_seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(llm.instruction).toMatch(/^If you finished/);
		expect(llm.instruction).not.toMatch(/^undefined/);
	});

	it("runAsyncImpl ignores live tool-injection path entirely", async () => {
		const plain = new MockSubAgent("async_only");
		plain.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "async_only" });
		});
		const agent = new SequentialAgent({
			name: "async_seq",
			description: "d",
			subAgents: [plain],
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events.map((e) => e.author)).toEqual(["async_only"]);
		expect(plain.runLive).not.toHaveBeenCalled();
	});
});
