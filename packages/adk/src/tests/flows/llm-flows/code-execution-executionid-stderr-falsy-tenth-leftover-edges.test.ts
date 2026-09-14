import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../../agents/llm-agent";
import type { InvocationContext } from "../../../agents/invocation-context";
import { BaseCodeExecutor } from "../../../code-executors/base-code-executor";
import { CodeExecutorContext } from "../../../code-executors/code-executor-context";
import {
	getOrSetExecutionId,
	postProcessCodeExecutionResult,
} from "../../../flows/llm-flows/code-execution";
import { State } from "../../../sessions/state";

class StubExecutor extends BaseCodeExecutor {
	executeCode = vi.fn(async () => ({
		stdout: "ok",
		stderr: "",
		outputFiles: [] as Array<{
			name: string;
			content: string;
			mimeType: string;
		}>,
	}));
}

function makeInvocation(
	overrides: Record<string, unknown> = {},
): InvocationContext {
	const agent = new LlmAgent({
		name: "coder",
		model: "gpt-4o",
		codeExecutor: new StubExecutor(),
	});
	(agent as LlmAgent).codeExecutor = { stateful: true } as any;
	return {
		agent,
		invocationId: "inv-1",
		appName: "app",
		userId: "u",
		branch: "root",
		session: {
			id: "sess-1",
			appName: "app",
			userId: "u",
			state: {},
			events: [],
		},
		artifactService: { saveArtifact: vi.fn(async () => 1) },
		...overrides,
	} as unknown as InvocationContext;
}

describe("code-execution getOrSetExecutionId / stderr truthiness tenth leftover", () => {
	it("stored empty-string execution id is falsy and overwritten with session.id", () => {
		const ctx = new CodeExecutorContext(State.create({}, {}));
		ctx.setExecutionId("");
		expect(getOrSetExecutionId(makeInvocation(), ctx)).toBe("sess-1");
		expect(ctx.getExecutionId()).toBe("sess-1");
	});

	it("whitespace execution id is truthy and preserved", () => {
		const ctx = new CodeExecutorContext(State.create({}, {}));
		ctx.setExecutionId(" ");
		expect(getOrSetExecutionId(makeInvocation(), ctx)).toBe(" ");
		expect(ctx.getExecutionId()).toBe(" ");
	});

	it.each([
		" ",
		"0",
		"false",
	])("stderr %j is truthy so postProcess increments error count", async (stderr) => {
		const ctx = new CodeExecutorContext(State.create({}, {}));
		await postProcessCodeExecutionResult(makeInvocation(), ctx, {
			stdout: "",
			stderr,
			outputFiles: [],
		});
		expect(ctx.getErrorCount("inv-1")).toBe(1);
	});

	it.each([
		"",
		0,
		false,
	] as const)("stderr %j is falsy so postProcess resets error count", async (stderr) => {
		const ctx = new CodeExecutorContext(State.create({}, {}));
		ctx.incrementErrorCount("inv-1");
		await postProcessCodeExecutionResult(makeInvocation(), ctx, {
			stdout: "ok",
			stderr: stderr as any,
			outputFiles: [],
		});
		expect(ctx.getErrorCount("inv-1")).toBe(0);
	});
});
