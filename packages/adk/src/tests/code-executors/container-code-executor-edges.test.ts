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

function makeContainer() {
	const inspect = vi.fn().mockResolvedValue({ ExitCode: 0 });
	const execStart = vi.fn().mockResolvedValue(makeStream([]));
	const exec = vi.fn().mockResolvedValue({
		start: execStart,
		inspect,
	});
	return {
		id: "ctr-edge",
		exec,
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
		_inspect: inspect,
		_execStart: execStart,
	};
}

describe("ContainerCodeExecutor edges", () => {
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

	afterEach(async () => {
		for (const [event, listener] of listeners.splice(0)) {
			originalRemove(event, listener);
		}
		vi.restoreAllMocks();
	});

	describe("image || DEFAULT_IMAGE_TAG", () => {
		it("uses adk-code-executor:latest when only dockerPath is provided", () => {
			const executor = new ContainerCodeExecutor({ dockerPath: "." });
			expect((executor as any).image).toBe("adk-code-executor:latest");
		});

		it("honors explicit image over default tag", () => {
			const executor = new ContainerCodeExecutor({ image: "python:3.12" });
			expect((executor as any).image).toBe("python:3.12");
		});

		it("passes resolved image to createContainer on init", async () => {
			existsSync.mockReturnValue(true);
			buildImage.mockResolvedValue({});
			followProgress.mockImplementation(
				(_s: any, done: (err: Error | null) => void) => done(null),
			);
			const container = makeContainer();
			createContainer.mockResolvedValue(container);
			container.exec.mockResolvedValue({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			});

			const executor = new ContainerCodeExecutor({ dockerPath: "." });
			await (executor as any).initContainer();
			expect(createContainer).toHaveBeenCalledWith(
				expect.objectContaining({ Image: "adk-code-executor:latest" }),
			);
		});
	});

	describe("executionTimeout ?? 30000", () => {
		it("defaults executionTimeout to 30000 when unset", () => {
			const executor = new ContainerCodeExecutor({ image: "python:3" });
			expect((executor as any).executionTimeout).toBe(30000);
		});

		it("honors custom executionTimeout", () => {
			const executor = new ContainerCodeExecutor({
				image: "python:3",
				executionTimeout: 12_000,
			});
			expect((executor as any).executionTimeout).toBe(12_000);
		});

		it("createTimeoutPromise uses configured timeout in message", async () => {
			vi.useFakeTimers();
			const executor = new ContainerCodeExecutor({
				image: "python:3",
				executionTimeout: 25,
			});
			const pending = (executor as any).createTimeoutPromise();
			const expectation = expect(pending).rejects.toThrow(
				/Code execution timed out after 25ms/,
			);
			await vi.advanceTimersByTimeAsync(25);
			await expectation;
			vi.useRealTimers();
		});
	});

	describe("ExitCode || 0", () => {
		it("treats missing ExitCode as 0 in collectOutput", async () => {
			const executor = new ContainerCodeExecutor({ image: "python:3" });
			const stream = makeStream([]);
			const output = await (executor as any).collectOutput(stream, {
				inspect: vi.fn().mockResolvedValue({}),
			});
			expect(output.exitCode).toBe(0);
		});

		it("preserves non-zero ExitCode from inspect", async () => {
			const executor = new ContainerCodeExecutor({ image: "python:3" });
			const stdoutChunk = Buffer.concat([
				Buffer.from([1, 0, 0, 0, 0, 0, 0, 3]),
				Buffer.from("abc"),
			]);
			const stream = makeStream([stdoutChunk]);
			const output = await (executor as any).collectOutput(stream, {
				inspect: vi.fn().mockResolvedValue({ ExitCode: 7 }),
			});
			expect(output.exitCode).toBe(7);
			expect(output.stdout).toBe("abc");
		});
	});

	describe("String(error) mapping in executeCode", () => {
		it("maps non-Error throws via String(error)", async () => {
			const container = makeContainer();
			createContainer.mockResolvedValue(container);
			container.exec
				.mockResolvedValueOnce({
					start: vi.fn().mockResolvedValue(makeStream([])),
					inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
				})
				.mockResolvedValueOnce({
					start: vi.fn().mockRejectedValue("raw-string-fail"),
					inspect: vi.fn(),
				});

			const executor = new ContainerCodeExecutor({ image: "python:3" });
			const result = await executor.executeCode({} as any, {
				code: "print(1)",
				inputFiles: [],
			});
			expect(result.stderr).toContain("raw-string-fail");
			expect(result.stderr).toContain("Container execution error:");
		});

		it("maps Error instances via error.message", async () => {
			const container = makeContainer();
			createContainer.mockResolvedValue(container);
			container.exec
				.mockResolvedValueOnce({
					start: vi.fn().mockResolvedValue(makeStream([])),
					inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
				})
				.mockRejectedValueOnce(new Error("docker daemon unavailable"));

			const executor = new ContainerCodeExecutor({ image: "python:3" });
			const result = await executor.executeCode({} as any, {
				code: "print(1)",
				inputFiles: [],
			});
			expect(result.stderr).toContain("docker daemon unavailable");
		});

		it("maps timeout Errors to timeout stderr", async () => {
			const container = makeContainer();
			createContainer.mockResolvedValue(container);
			container.exec
				.mockResolvedValueOnce({
					start: vi.fn().mockResolvedValue(makeStream([])),
					inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
				})
				.mockResolvedValueOnce({
					start: vi
						.fn()
						.mockRejectedValue(new Error("operation timeout while waiting")),
					inspect: vi.fn(),
				});

			const executor = new ContainerCodeExecutor({
				image: "python:3",
				executionTimeout: 2500,
			});
			const result = await executor.executeCode({} as any, {
				code: "print(1)",
				inputFiles: [],
			});
			expect(result.stderr).toMatch(/timed out after 2500ms/);
			expect(result.stdout).toBe("");
		});
	});
});
