import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createContainer, existsSync, DockerMock } = vi.hoisted(() => {
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

import { ContainerCodeExecutor } from "../../code-executors/container-code-executor";

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

function frame(streamType: number, payload: string): Buffer {
	return Buffer.concat([
		Buffer.from([streamType, 0, 0, 0, 0, 0, 0, payload.length]),
		Buffer.from(payload),
	]);
}

function makeContainer() {
	const inspect = vi.fn().mockResolvedValue({ ExitCode: 0 });
	const execStart = vi.fn().mockResolvedValue(makeStream([]));
	const exec = vi.fn().mockResolvedValue({
		start: execStart,
		inspect,
	});
	return {
		id: "ctr-demux",
		exec,
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
		_inspect: inspect,
		_execStart: execStart,
	};
}

/**
 * Tenth leftover: demux only handles streamType 1/2; timeout catch is
 * case-sensitive includes("timeout") so "timed out" / "TIMEOUT" miss it.
 */
describe("ContainerCodeExecutor ignored streamType / timeout case tenth leftover", () => {
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

	it.each([
		{ type: 0, label: "stdin" },
		{ type: 3, label: "stderr-ext" },
		{ type: 255, label: "unknown" },
	])("streamType $type ($label) payload is ignored", async ({ type }) => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(
			makeStream([frame(type, "secret")]),
			{ inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }) },
		);
		expect(output.stdout).toBe("");
		expect(output.stderr).toBe("");
	});

	it("stdout+ignored+stderr still collects only 1 and 2", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(
			makeStream([
				frame(1, "out\n"),
				frame(0, "stdin-drop"),
				frame(2, "err\n"),
				frame(3, "ext-drop"),
			]),
			{ inspect: vi.fn().mockResolvedValue({ ExitCode: 1 }) },
		);
		expect(output.stdout).toBe("out");
		expect(output.stderr).toBe("err");
		expect(output.exitCode).toBe(1);
	});

	it('"TIMEOUT" uppercase does not match includes("timeout") → container error', async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockResolvedValueOnce({
				start: vi.fn().mockRejectedValue(new Error("TIMEOUT waiting")),
				inspect: vi.fn(),
			});
		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout: 1111,
		});
		const result = await executor.executeCode({} as any, {
			code: "print(1)",
			inputFiles: [],
		});
		expect(result.stderr).toContain(
			"Container execution error: TIMEOUT waiting",
		);
		expect(result.stderr).not.toMatch(/timed out after 1111ms$/);
	});

	it('"timed out" from createTimeoutPromise misses includes("timeout") so it is prefixed', async () => {
		vi.useFakeTimers();
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue({
					on() {
						return this;
					},
				}),
				inspect: vi.fn(),
			});
		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout: 40,
		});
		const pending = executor.executeCode({} as any, {
			code: "sleep",
			inputFiles: [],
		});
		await vi.advanceTimersByTimeAsync(50);
		const result = await pending;
		expect(result.stderr).toBe(
			"Container execution error: Code execution timed out after 40ms",
		);
		vi.useRealTimers();
	});

	it('lowercase "timeout" still takes the dedicated timeout stderr', async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockResolvedValueOnce({
				start: vi.fn().mockRejectedValue(new Error("idle timeout")),
				inspect: vi.fn(),
			});
		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout: 2222,
		});
		const result = await executor.executeCode({} as any, {
			code: "print(1)",
			inputFiles: [],
		});
		expect(result.stderr).toBe("Code execution timed out after 2222ms");
	});
});
