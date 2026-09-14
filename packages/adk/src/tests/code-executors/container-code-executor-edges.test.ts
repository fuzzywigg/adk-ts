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

function demuxChunk(streamType: number, payload: string): Buffer {
	const body = Buffer.from(payload);
	const header = Buffer.alloc(8);
	header[0] = streamType;
	header.writeUInt32BE(body.length, 4);
	return Buffer.concat([header, body]);
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

describe("ContainerCodeExecutor leftover edges", () => {
	const listeners: Array<[string, (...args: any[]) => void]> = [];
	const originalOn = process.on.bind(process);

	beforeEach(() => {
		vi.clearAllMocks();
		existsSync.mockReturnValue(true);
		listeners.length = 0;
		vi.spyOn(process, "on").mockImplementation(((
			event: string,
			cb: (...args: any[]) => void,
		) => {
			listeners.push([event, cb]);
			return originalOn(event as any, cb as any);
		}) as any);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("collectOutput ignores chunks shorter than 8 bytes and empty buffers", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const short = Buffer.from([1, 2, 3]);
		const empty = Buffer.alloc(0);
		const stdout = demuxChunk(1, "ok");
		const stream = makeStream([short, empty, stdout]);
		const output = await (executor as any).collectOutput(stream, {
			inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
		});
		expect(output.stdout).toBe("ok");
		expect(output.stderr).toBe("");
	});

	it("collectOutput ignores stream types other than 1 and 2", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const stream = makeStream([
			demuxChunk(0, "stdin?"),
			demuxChunk(3, "unknown"),
			demuxChunk(1, "out"),
			demuxChunk(2, "err"),
		]);
		const output = await (executor as any).collectOutput(stream, {
			inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
		});
		expect(output.stdout).toBe("out");
		expect(output.stderr).toBe("err");
	});

	it("collectOutput interleaves stdout and stderr chunks", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const stream = makeStream([
			demuxChunk(1, "a"),
			demuxChunk(2, "e1"),
			demuxChunk(1, "b"),
			demuxChunk(2, "e2"),
		]);
		const output = await (executor as any).collectOutput(stream, {
			inspect: vi.fn().mockResolvedValue({ ExitCode: 7 }),
		});
		expect(output.stdout).toBe("ab");
		expect(output.stderr).toBe("e1e2");
		expect(output.exitCode).toBe(7);
	});

	it("cleanupContainer skips remove when stop throws", async () => {
		const container = makeContainer();
		container.stop.mockRejectedValueOnce(new Error("already stopped"));
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const errorSpy = vi
			.spyOn((executor as any).logger, "error")
			.mockImplementation(() => {});
		(executor as any).container = container;
		(executor as any).isInitialized = true;

		await (executor as any).cleanupContainer();

		expect(container.stop).toHaveBeenCalled();
		expect(container.remove).not.toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalled();
		expect((executor as any).container).toBeUndefined();
		expect((executor as any).isInitialized).toBe(false);
	});

	it("cleanupContainer logs when remove throws after successful stop", async () => {
		const container = makeContainer();
		container.remove.mockRejectedValueOnce(new Error("remove failed"));
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const errorSpy = vi
			.spyOn((executor as any).logger, "error")
			.mockImplementation(() => {});
		(executor as any).container = container;
		(executor as any).isInitialized = true;

		await (executor as any).cleanupContainer();

		expect(container.stop).toHaveBeenCalled();
		expect(container.remove).toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalledWith(
			"Error during container cleanup",
			expect.any(Error),
		);
		expect((executor as any).container).toBeUndefined();
	});

	it("cleanupContainer is a no-op when container is already undefined", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		(executor as any).container = undefined;
		await expect((executor as any).cleanupContainer()).resolves.toBeUndefined();
	});

	it("executeCode returns timeout stderr when timeout wins the race", async () => {
		vi.useFakeTimers();
		const container = makeContainer();
		createContainer.mockResolvedValue(container);

		const hangingStream = {
			on() {
				return this;
			},
		};
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(hangingStream),
				inspect: vi.fn(),
			});

		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout: 50,
		});

		const pending = executor.executeCode({} as any, {
			code: "while True: pass",
			inputFiles: [],
		});
		await vi.advanceTimersByTimeAsync(50);
		const result = await pending;
		expect(result.stderr).toMatch(/timed out after 50ms/);
		expect(result.stdout).toBe("");
	});

	it("verifyPythonInstallation rejects when inspect throws in end handler", async () => {
		const container = makeContainer();
		container.exec.mockResolvedValueOnce({
			start: vi.fn().mockResolvedValue(makeStream([])),
			inspect: vi.fn().mockRejectedValue(new Error("inspect blew up")),
		});
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		(executor as any).container = container;

		await expect((executor as any).verifyPythonInstallation()).rejects.toThrow(
			/python3 is not installed/,
		);
	});

	it("buildDockerImage progress callback ignores non-stream events", async () => {
		const executor = new ContainerCodeExecutor({
			image: "custom:tag",
			dockerPath: "/tmp/docker",
		});
		existsSync.mockReturnValue(true);
		(executor as any).client = {
			buildImage: buildImage,
			modem: { followProgress },
		};
		buildImage.mockResolvedValueOnce({});
		followProgress.mockImplementation((_stream, onFinished, onProgress) => {
			onProgress({ status: "Downloading" });
			onProgress({ stream: "Step 1/2\n" });
			onFinished(null);
		});
		const debugSpy = vi
			.spyOn((executor as any).logger, "debug")
			.mockImplementation(() => {});

		await (executor as any).buildDockerImage();
		expect(debugSpy).toHaveBeenCalledWith("Build output:", "Step 1/2");
	});

	it("double dispose after failed initContainer cleanup is safe", async () => {
		createContainer.mockRejectedValueOnce(new Error("create failed"));
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		await expect(
			executor.executeCode({} as any, { code: "print(1)", inputFiles: [] }),
		).rejects.toThrow(/create failed/);

		await executor.dispose();
		await executor.dispose();
		expect((executor as any).isInitialized).toBe(false);
	});

	it("maps non-timeout Errors into Container execution error stderr", async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockResolvedValueOnce({
				start: vi.fn().mockRejectedValue(new Error("docker socket gone")),
				inspect: vi.fn(),
			});

		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const result = await executor.executeCode({} as any, {
			code: "print(1)",
			inputFiles: [],
		});
		expect(result.stderr).toMatch(
			/Container execution error: docker socket gone/,
		);
	});

	it("maps non-Error throws into Container execution error stderr", async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockResolvedValueOnce({
				start: vi.fn().mockRejectedValue("string-fail"),
				inspect: vi.fn(),
			});

		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const result = await executor.executeCode({} as any, {
			code: "print(1)",
			inputFiles: [],
		});
		expect(result.stderr).toMatch(/Container execution error: string-fail/);
	});

	it("buildDockerImage throws when dockerPath is unset", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		await expect((executor as any).buildDockerImage()).rejects.toThrow(
			/Docker path is not set/,
		);
	});

	it("buildDockerImage throws when path does not exist", async () => {
		existsSync.mockReturnValue(false);
		const executor = new ContainerCodeExecutor({
			image: "python:3",
			dockerPath: "/missing",
		});
		(executor as any).client = DockerMock.mock.instances[0] || {
			buildImage,
			modem: { followProgress },
		};
		await expect((executor as any).buildDockerImage()).rejects.toThrow(
			/Invalid Docker path/,
		);
	});

	it("initContainer cleans up when verifyPythonInstallation fails", async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec.mockResolvedValue({
			start: vi.fn().mockResolvedValue(makeStream([])),
			inspect: vi.fn().mockResolvedValue({ ExitCode: 1 }),
		});

		const executor = new ContainerCodeExecutor({ image: "python:3" });
		await expect((executor as any).initContainer()).rejects.toThrow(
			/python3 is not installed/,
		);
		expect(container.stop).toHaveBeenCalled();
		expect((executor as any).container).toBeUndefined();
	});
});
