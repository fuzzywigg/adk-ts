import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { LlmAgent } from "../../agents/llm-agent";
import { SequentialAgent } from "../../agents/sequential-agent";
import { Event } from "../../events/event";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";

const mockContext: InvocationContext = {
	invocationId: "twenty-second-seq-comp",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-seq-22c",
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
 * Twenty-second leftover (HEAVY residual complement after open #265
 * sequential true/±Infinity tip): Assert number `1` → `"1If…"`, `{}` →
 * `"[object Object]If…"`, `NaN` → `"NaNIf…"` via live `instruction +=`.
 */
describe("SequentialAgent instruction number-one/empty-object/NaN twenty-second leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "number 1", value: 1, prefix: "1" },
		{ label: "empty-object", value: {}, prefix: "\\[object Object\\]" },
		{ label: "NaN", value: Number.NaN, prefix: "NaN" },
	])("coerces instruction $label to '$prefixIf you finished…'", async ({
		value,
		prefix,
	}) => {
		const llm = new LlmAgent({
			name: "one_instr",
			model: "gemini-2.5-flash",
			instruction: "seed",
		});
		(llm as { instruction: unknown }).instruction = value;
		llm.runLive = vi.fn(async function* () {
			yield new Event({ author: "one_instr" });
		}) as any;
		const agent = new SequentialAgent({
			name: "one_seq",
			description: "d",
			subAgents: [llm],
		});
		for await (const _ of agent["runLiveImpl"](mockContext)) {
		}
		expect(String(llm.instruction)).toMatch(
			new RegExp(`^${prefix}If you finished`),
		);
		expect(String(llm.instruction)).toContain("taskCompleted");
	});
});
