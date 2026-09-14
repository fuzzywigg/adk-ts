import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { LlmAgent } from "../../agents/llm-agent";
import { SequentialAgent } from "../../agents/sequential-agent";
import { Event } from "../../events/event";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";

const mockContext: InvocationContext = {
	invocationId: "twelfth-seq-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-seq-12",
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
 * Twelfth leftover: live `instruction +=` string-coerces falsy numbers/booleans.
 * Fifth leftover pins undefined → "undefinedIf…" and null → "nullIf…" and
 * empty string without prefix. `0` / `false` become "0If…" / "falseIf…".
 */
describe("SequentialAgent instruction 0/false += twelfth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("coerces instruction 0 to '0If you finished…'", async () => {
		const llm = new LlmAgent({
			name: "zero_instr",
			model: "gemini-2.5-flash",
			instruction: "seed",
		});
		(llm as { instruction: unknown }).instruction = 0;
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "zero_instr" });
		}) as any;
		const agent = new SequentialAgent({
			name: "zero_seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(String(llm.instruction)).toMatch(/^0If you finished/);
		expect(String(llm.instruction)).toContain("taskCompleted");
	});

	it("coerces instruction false to 'falseIf you finished…'", async () => {
		const llm = new LlmAgent({
			name: "false_instr",
			model: "gemini-2.5-flash",
			instruction: "seed",
		});
		(llm as { instruction: unknown }).instruction = false;
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "false_instr" });
		}) as any;
		const agent = new SequentialAgent({
			name: "false_seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(String(llm.instruction)).toMatch(/^falseIf you finished/);
	});

	it("empty-string instruction still has no undefined prefix (fifth control)", async () => {
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
		expect(llm.instruction).not.toMatch(/^0If/);
	});
});
