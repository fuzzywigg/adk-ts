import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createContainer, buildImage, followProgress, existsSync, DockerMock } =
	vi.hoisted(() => {
		const createContainer = vi.fn();
		const buildImage = vi.fn();
		const followProgress = vi.fn();
		const existsSync = vi.fn();
		const DockerMock = vi.fn(function Docker(
			this: any,
			opts?: { host?: string },
		) {
			this.host = opts?.host;
			this.createContainer = createContainer;
			this.buildImage = buildImage;
			this.modem = { followProgress };
		});
		return {
			createContainer,
			buildImage,
			followProgress,
			existsSync,
			DockerMock,
		};
	});

vi.mock("dockerode", () => ({
	default: DockerMock,
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync,
	};
});

import type { InvocationContext } from "../../agents/invocation-context";
import type { BaseCodeExecutorConfig } from "../../code-executors/base-code-executor";
import { BuiltInCodeExecutor } from "../../code-executors/built-in-code-executor";
import { ContainerCodeExecutor } from "../../code-executors/container-code-executor";
import { LlmRequest } from "../../models/llm-request";

function makeStream(chunks: Buffer[] = []) {
	const handlers: Record<string, Array<(...args: any[]) => void>> = {};
	return {
		on(event: string, cb: (...args: any[]) => void) {
			handlers[event] = handlers[event] || [];
			handlers[event].push(cb);
			if (event === "end") {
				queueMicrotask(() => {
					for (const chunk of chunks) {
						for (const dataCb of handlers.data || []) dataCb(chunk);
					}
					for (const endCb of handlers.end || []) endCb();
				});
			}
			return this;
		},
	};
}

function makeContainer() {
	const inspect = vi.fn().mockResolvedValue({ ExitCode: 0 });
	const execStart = vi.fn().mockResolvedValue(makeStream([]));
	const exec = vi.fn().mockResolvedValue({
		start: execStart,
		inspect,
	});
	return {
		id: "ctr-fourth",
		exec,
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
	};
}

describe("ContainerCodeExecutor fourth leftover constructor / coalesce matrices", () => {
	const listeners: Array<[string, (...args: any[]) => void]> = [];
	const originalOn = process.on.bind(process);
	const originalRemove = process.removeListener.bind(process);

	beforeEach(() => {
		vi.clearAllMocks();
		existsSync.mockReturnValue(true);
		vi.spyOn(process, "on").mockImplementation(((event: any, listener: any) => {
			listeners.push([event, listener]);
			return originalOn(event, listener);
		}) as any);
	});

	afterEach(() => {
		for (const [event, listener] of listeners.splice(0)) {
			originalRemove(event, listener);
		}
		vi.restoreAllMocks();
	});

	it("rejects empty config missing image and dockerPath", () => {
		expect(() => new ContainerCodeExecutor({})).toThrow(
			/Either image or dockerPath/,
		);
	});

	it("rejects undefined-like empty config", () => {
		expect(() => new ContainerCodeExecutor()).toThrow(
			/Either image or dockerPath/,
		);
	});

	const rejectCombos: Array<{
		label: string;
		config: Record<string, any>;
		pattern: RegExp;
	}> = [
		{
			label: "stateful+image",
			config: { image: "python:3", stateful: true },
			pattern: /stateful=true/,
		},
		{
			label: "optimizeDataFile+image",
			config: { image: "python:3", optimizeDataFile: true },
			pattern: /optimizeDataFile=true/,
		},
		{
			label: "stateful+dockerPath",
			config: { dockerPath: "/tmp/docker", stateful: true },
			pattern: /stateful=true/,
		},
		{
			label: "optimizeDataFile+dockerPath",
			config: { dockerPath: "/tmp/docker", optimizeDataFile: true },
			pattern: /optimizeDataFile=true/,
		},
		{
			label: "both forbidden flags",
			config: {
				image: "python:3",
				stateful: true,
				optimizeDataFile: true,
			},
			pattern: /stateful=true/,
		},
	];

	for (const { label, config, pattern } of rejectCombos) {
		it(`constructor rejects ${label}`, () => {
			expect(() => new ContainerCodeExecutor(config as any)).toThrow(pattern);
		});
	}

	const imageTags = [
		"python:3",
		"python:3.12-slim",
		"custom/adk:latest",
		"registry.example.com/img:1",
	];

	for (const image of imageTags) {
		it(`honors explicit image ${image}`, () => {
			const executor = new ContainerCodeExecutor({ image });
			expect((executor as any).image).toBe(image);
			expect(executor.stateful).toBe(false);
			expect(executor.optimizeDataFile).toBe(false);
		});
	}

	it("coalesces DEFAULT_IMAGE_TAG when only dockerPath set", () => {
		const executor = new ContainerCodeExecutor({ dockerPath: "." });
		expect((executor as any).image).toBe("adk-code-executor:latest");
	});

	it("prefers explicit image when dockerPath also set", () => {
		const executor = new ContainerCodeExecutor({
			image: "override:tag",
			dockerPath: ".",
		});
		expect((executor as any).image).toBe("override:tag");
	});

	const timeouts = [0, 1, 1000, 30_000, 60_000];
	for (const executionTimeout of timeouts) {
		it(`executionTimeout coalesce override ${executionTimeout}`, () => {
			const executor = new ContainerCodeExecutor({
				image: "python:3",
				executionTimeout,
			});
			expect((executor as any).executionTimeout).toBe(executionTimeout);
		});
	}

	it("executionTimeout defaults to 30000 when unset", () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		expect((executor as any).executionTimeout).toBe(30_000);
	});

	it("baseUrl wires Docker host option", () => {
		new ContainerCodeExecutor({
			image: "python:3",
			baseUrl: "tcp://127.0.0.1:2375",
		});
		expect(DockerMock).toHaveBeenCalledWith({
			host: "tcp://127.0.0.1:2375",
		});
	});

	it("omits host when baseUrl unset", () => {
		new ContainerCodeExecutor({ image: "python:3" });
		expect(DockerMock).toHaveBeenCalledWith();
	});

	const baseConfigOverrides: BaseCodeExecutorConfig[] = [
		{ errorRetryAttempts: 0 },
		{ errorRetryAttempts: 7 },
		{ codeBlockDelimiters: [["<<", ">>"]] },
		{ executionResultDelimiters: ["[", "]"] },
		{
			errorRetryAttempts: 1,
			codeBlockDelimiters: [["A", "B"]],
			executionResultDelimiters: ["X", "Y"],
		},
	];

	for (const [i, partial] of baseConfigOverrides.entries()) {
		it(`Container inherits BaseCodeExecutor coalesce #${i}`, () => {
			const executor = new ContainerCodeExecutor({
				image: "python:3",
				...partial,
			});
			expect(executor.errorRetryAttempts).toBe(partial.errorRetryAttempts ?? 2);
			if (partial.codeBlockDelimiters) {
				expect(executor.codeBlockDelimiters).toEqual(
					partial.codeBlockDelimiters,
				);
			}
			if (partial.executionResultDelimiters) {
				expect(executor.executionResultDelimiters).toEqual(
					partial.executionResultDelimiters,
				);
			}
			expect(executor.stateful).toBe(false);
			expect(executor.optimizeDataFile).toBe(false);
		});
	}

	it("createTimeoutPromise rejects with configured timeout message", async () => {
		vi.useFakeTimers();
		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout: 40,
		});
		const pending = (executor as any).createTimeoutPromise();
		const expectation = expect(pending).rejects.toThrow(
			/Code execution timed out after 40ms/,
		);
		await vi.advanceTimersByTimeAsync(40);
		await expectation;
		vi.useRealTimers();
	});

	it("ExitCode || 0 coalesce in collectOutput", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(makeStream([]), {
			inspect: vi.fn().mockResolvedValue({}),
		});
		expect(output.exitCode).toBe(0);
	});

	it("preserves nonzero ExitCode in collectOutput", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(makeStream([]), {
			inspect: vi.fn().mockResolvedValue({ ExitCode: 9 }),
		});
		expect(output.exitCode).toBe(9);
	});

	it("executeCode maps Error.message on failure", async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockRejectedValueOnce(new Error("daemon down"));

		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const result = await executor.executeCode({} as InvocationContext, {
			code: "print(1)",
			inputFiles: [],
		});
		expect(result.stderr).toContain("daemon down");
		expect(result.stdout).toBe("");
		expect(result.outputFiles).toEqual([]);
	});

	it("executeCode maps String(error) for non-Error throws", async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockResolvedValueOnce({
				start: vi.fn().mockRejectedValue(12345),
				inspect: vi.fn(),
			});

		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const result = await executor.executeCode({} as InvocationContext, {
			code: "x",
			inputFiles: [],
		});
		expect(result.stderr).toContain("12345");
		expect(result.stderr).toContain("Container execution error:");
	});

	it("executeCode maps timeout-containing Error to timeout stderr", async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockResolvedValueOnce({
				start: vi.fn().mockRejectedValue(new Error("wait timeout exceeded")),
				inspect: vi.fn(),
			});

		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout: 900,
		});
		const result = await executor.executeCode({} as InvocationContext, {
			code: "x",
			inputFiles: [],
		});
		expect(result.stderr).toMatch(/timed out after 900ms/);
	});

	it("dispose cleans up when container unset", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		await expect(executor.dispose()).resolves.toBeUndefined();
	});
});

describe("BuiltInCodeExecutor fourth leftover model / config matrices", () => {
	const configCombos: BaseCodeExecutorConfig[] = [
		{},
		{ stateful: true },
		{ optimizeDataFile: true },
		{ stateful: false, optimizeDataFile: false },
		{ errorRetryAttempts: 0 },
		{ errorRetryAttempts: 9 },
		{
			codeBlockDelimiters: [["```", "```"]],
			executionResultDelimiters: ["<", ">"],
		},
		{
			stateful: true,
			optimizeDataFile: true,
			errorRetryAttempts: 3,
			codeBlockDelimiters: [
				["A", "B"],
				["C", "D"],
			],
			executionResultDelimiters: ["[", "]"],
		},
	];

	for (const [i, config] of configCombos.entries()) {
		it(`BuiltIn config coalesce combo #${i}`, () => {
			const executor = new BuiltInCodeExecutor(config);
			expect(executor.stateful).toBe(config.stateful ?? false);
			expect(executor.optimizeDataFile).toBe(config.optimizeDataFile ?? false);
			expect(executor.errorRetryAttempts).toBe(config.errorRetryAttempts ?? 2);
			if (config.codeBlockDelimiters) {
				expect(executor.codeBlockDelimiters).toEqual(
					config.codeBlockDelimiters,
				);
			} else {
				expect(executor.codeBlockDelimiters).toEqual([
					["`tool_code\n", "\n`"],
					["`python\n", "\n`"],
				]);
			}
			if (config.executionResultDelimiters) {
				expect(executor.executionResultDelimiters).toEqual(
					config.executionResultDelimiters,
				);
			} else {
				expect(executor.executionResultDelimiters).toEqual([
					"`tool_output\n",
					"\n`",
				]);
			}
		});
	}

	const acceptedModels = [
		"gemini-2",
		"gemini-2.0-flash",
		"gemini-2.0-pro",
		"gemini-2.5-flash",
		"gemini-2.5-pro",
		"gemini-2-exp",
		"gemini-2.0-flash-thinking",
	];

	for (const model of acceptedModels) {
		it(`processLlmRequest accepts ${model}`, () => {
			const executor = new BuiltInCodeExecutor();
			const req = new LlmRequest({ model });
			executor.processLlmRequest(req);
			expect(req.config?.tools?.some((t: any) => "codeExecution" in t)).toBe(
				true,
			);
		});
	}

	const rejectedModels = [
		undefined,
		"",
		"gemini-1.5-pro",
		"gemini-1.5-flash",
		"gemini-3.0",
		"gpt-4o",
		"claude-3-opus",
		"gemini",
	];

	for (const model of rejectedModels) {
		it(`processLlmRequest rejects ${String(model)}`, () => {
			const executor = new BuiltInCodeExecutor();
			expect(() =>
				executor.processLlmRequest(new LlmRequest({ model: model as any })),
			).toThrow(/not supported/);
		});
	}

	it("creates config when missing then appends tool", () => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({ model: "gemini-2.0-flash" });
		expect(req.config).toBeUndefined();
		executor.processLlmRequest(req);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
	});

	it("initializes tools when config present without tools", () => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({
			model: "gemini-2.5-pro",
			config: { temperature: 0.1 } as any,
		});
		executor.processLlmRequest(req);
		expect((req.config as any).temperature).toBe(0.1);
		expect(req.config?.tools).toEqual([{ codeExecution: {} }]);
	});

	it("appends to existing tools array", () => {
		const executor = new BuiltInCodeExecutor();
		const req = new LlmRequest({ model: "gemini-2.0-flash" });
		executor.processLlmRequest(req);
		req.config!.tools = [{ functionDeclarations: [] } as any];
		executor.processLlmRequest(req);
		expect(req.config?.tools).toHaveLength(2);
		expect(req.config?.tools?.[1]).toEqual({ codeExecution: {} });
	});

	it("executeCode always throws regardless of inputs", async () => {
		const executor = new BuiltInCodeExecutor({ stateful: true });
		const inputs = [
			{ code: "", inputFiles: [] },
			{ code: "print(1)", inputFiles: [] },
			{
				code: "x",
				inputFiles: [{ name: "a.csv", content: "YQ==", mimeType: "text/csv" }],
				executionId: "e1",
			},
		];
		for (const input of inputs) {
			await expect(
				executor.executeCode({} as InvocationContext, input),
			).rejects.toThrow(/should not be called directly/);
		}
	});
});
