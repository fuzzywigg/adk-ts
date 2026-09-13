import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../../agents/llm-agent";
import type { InvocationContext } from "../../../agents/invocation-context";
import {
	BaseCodeExecutor,
	type BaseCodeExecutorConfig,
} from "../../../code-executors/base-code-executor";
import { BuiltInCodeExecutor } from "../../../code-executors/built-in-code-executor";
import type {
	CodeExecutionInput,
	CodeExecutionResult,
} from "../../../code-executors/code-execution-utils";
import {
	requestProcessor,
	responseProcessor,
} from "../../../flows/llm-flows/code-execution";
import { LlmRequest } from "../../../models/llm-request";
import { LlmResponse } from "../../../models/llm-response";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

class StubCodeExecutor extends BaseCodeExecutor {
	executed: string[] = [];

	constructor(config: BaseCodeExecutorConfig = {}) {
		super({
			codeBlockDelimiters: [["```\n", "\n```"]],
			executionResultDelimiters: ["```\n", "\n```"],
			...config,
		});
	}

	async executeCode(
		_invocationContext: InvocationContext,
		codeExecutionInput: CodeExecutionInput,
	): Promise<CodeExecutionResult> {
		this.executed.push(codeExecutionInput.code);
		return {
			stdout: "ok",
			stderr: "",
			outputFiles: [],
		};
	}
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

describe("code-execution processors", () => {
	it("exports requestProcessor and responseProcessor", () => {
		expect(requestProcessor).toBeDefined();
		expect(typeof requestProcessor.runAsync).toBe("function");
		expect(responseProcessor).toBeDefined();
		expect(typeof responseProcessor.runAsync).toBe("function");
	});

	it("requestProcessor no-ops when agent has no codeExecutor", async () => {
		const llmRequest = new LlmRequest();
		llmRequest.contents = [{ role: "user", parts: [{ text: "hello" }] }];
		const context = {
			agent: { name: "plain-agent" },
		} as InvocationContext;

		const events = await collect(
			requestProcessor.runAsync(context, llmRequest),
		);

		expect(events).toEqual([]);
		expect(llmRequest.contents).toEqual([
			{ role: "user", parts: [{ text: "hello" }] },
		]);
	});

	it("responseProcessor no-ops when agent has no codeExecutor", async () => {
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: "```python\nprint(1)\n```" }],
			},
		});
		const context = {
			agent: { name: "plain-agent" },
			invocationId: "inv-1",
			session: { state: {} },
		} as unknown as InvocationContext;

		const events = await collect(responseProcessor.runAsync(context, response));

		expect(events).toEqual([]);
		expect(response.content?.parts?.[0].text).toContain("print(1)");
	});

	it("requestProcessor invokes BuiltInCodeExecutor.processLlmRequest", async () => {
		const agent = new LlmAgent({
			name: "code_agent",
			codeExecutor: new BuiltInCodeExecutor(),
		});
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });
		llmRequest.contents = [{ role: "user", parts: [{ text: "run code" }] }];
		const context = {
			agent,
			invocationId: "inv-1",
			session: { state: {} },
		} as unknown as InvocationContext;

		const events = await collect(
			requestProcessor.runAsync(context, llmRequest),
		);

		expect(events).toEqual([]);
		expect(llmRequest.config?.tools).toEqual([{ codeExecution: {} }]);
	});

	it("responseProcessor skips partial streaming responses", async () => {
		const executor = new StubCodeExecutor();
		const agent = new LlmAgent({
			name: "code_agent",
			codeExecutor: executor,
		});
		const response = new LlmResponse({
			partial: true,
			content: {
				role: "model",
				parts: [{ text: "```\nprint(1)\n```" }],
			},
		});
		const context = {
			agent,
			invocationId: "inv-1",
			session: { state: {} },
		} as unknown as InvocationContext;

		const events = await collect(responseProcessor.runAsync(context, response));
		expect(events).toEqual([]);
		expect(executor.executed).toEqual([]);
	});

	it("responseProcessor executes fenced code via StubCodeExecutor", async () => {
		const executor = new StubCodeExecutor();
		const agent = new LlmAgent({
			name: "code_agent",
			codeExecutor: executor,
		});
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: "prefix\n```\nprint(2)\n```\nsuffix" }],
			},
		});
		const context = {
			agent,
			invocationId: "inv-ce",
			branch: "main",
			appName: "app",
			userId: "u1",
			session: { id: "s1", state: {} },
			artifactService: {
				saveArtifact: vi.fn(async () => 1),
			},
		} as unknown as InvocationContext;

		const events = await collect(responseProcessor.runAsync(context, response));

		expect(executor.executed.some((code) => code.includes("print(2)"))).toBe(
			true,
		);
		expect(events.length).toBeGreaterThanOrEqual(2);
		expect(response.content).toBeUndefined();
	});

	it("responseProcessor no-ops for BuiltInCodeExecutor", async () => {
		const agent = new LlmAgent({
			name: "code_agent",
			codeExecutor: new BuiltInCodeExecutor(),
		});
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: "```\nprint(1)\n```" }],
			},
		});
		const context = {
			agent,
			invocationId: "inv-1",
			session: { state: {} },
		} as unknown as InvocationContext;

		const events = await collect(responseProcessor.runAsync(context, response));
		expect(events).toEqual([]);
		expect(response.content?.parts?.[0].text).toContain("print(1)");
	});

	it("requestProcessor early-returns when optimizeDataFile is false", async () => {
		const executor = new StubCodeExecutor({ optimizeDataFile: false });
		const agent = new LlmAgent({
			name: "code_agent",
			codeExecutor: executor,
		});
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });
		llmRequest.contents = [{ role: "user", parts: [{ text: "hi" }] }];
		const context = {
			agent,
			invocationId: "inv-1",
			session: { state: {} },
		} as unknown as InvocationContext;

		const events = await collect(
			requestProcessor.runAsync(context, llmRequest),
		);
		expect(events).toEqual([]);
		expect(executor.executed).toEqual([]);
	});
});
