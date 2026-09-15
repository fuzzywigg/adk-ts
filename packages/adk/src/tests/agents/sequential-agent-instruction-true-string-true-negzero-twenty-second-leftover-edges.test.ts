import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { LlmAgent } from "../../agents/llm-agent";
import { SequentialAgent } from "../../agents/sequential-agent";
import { Event } from "../../events/event";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";

const mockContext: InvocationContext = {
	invocationId: "twenty-second-seq-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-seq-22",
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
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twelfth pins instruction `0`/`false` `+=` coerce. Assert boolean `true` /
 * `"true"` / `[]` / ±Infinity string-coerce via live `instruction +=`;
 * SameValueZero `-0` becomes `"0If…"` — residual true asymmetry on
 * SequentialAgent (never covered by twentieth/twenty-first tips).
 */
describe("SequentialAgent instruction true/string-true/negzero twenty-second leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "boolean true", value: true, prefix: "true" },
		{ label: '"true"', value: "true", prefix: "true" },
		{
			label: "POSITIVE_INFINITY",
			value: Number.POSITIVE_INFINITY,
			prefix: "Infinity",
		},
		{
			label: "NEGATIVE_INFINITY",
			value: Number.NEGATIVE_INFINITY,
			prefix: "-Infinity",
		},
	])("coerces instruction $label to '$prefixIf you finished…'", async ({
		value,
		prefix,
	}) => {
		const llm = new LlmAgent({
			name: "true_instr",
			model: "gemini-2.5-flash",
			instruction: "seed",
		});
		(llm as { instruction: unknown }).instruction = value;
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "true_instr" });
		}) as any;
		const agent = new SequentialAgent({
			name: "true_seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(String(llm.instruction)).toMatch(
			new RegExp(`^${prefix.replace("-", "\\-")}If you finished`),
		);
		expect(String(llm.instruction)).toContain("taskCompleted");
	});

	it('SameValueZero -0 instruction coerces to "0If you finished…"', async () => {
		const llm = new LlmAgent({
			name: "neg0_instr",
			model: "gemini-2.5-flash",
			instruction: "seed",
		});
		(llm as { instruction: unknown }).instruction = -0;
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "neg0_instr" });
		}) as any;
		const agent = new SequentialAgent({
			name: "neg0_seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(String(llm.instruction)).toMatch(/^0If you finished/);
	});

	it("empty-array instruction ToStrings to empty prefix (no undefined)", async () => {
		const llm = new LlmAgent({
			name: "arr_instr",
			model: "gemini-2.5-flash",
			instruction: "seed",
		});
		(llm as { instruction: unknown }).instruction = [];
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "arr_instr" });
		}) as any;
		const agent = new SequentialAgent({
			name: "arr_seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(String(llm.instruction)).toMatch(/^If you finished/);
		expect(String(llm.instruction)).not.toMatch(/^undefined/);
	});

	it('string "false" still coerces as twelfth/fifth control asymmetry', async () => {
		const llm = new LlmAgent({
			name: "false_instr",
			model: "gemini-2.5-flash",
			instruction: "seed",
		});
		(llm as { instruction: unknown }).instruction = "false";
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
});
