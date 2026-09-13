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
	const handlers: Record<string, Function[]> = {};
	return {
		on(event: string, cb: Function) {
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
		id: "ctr-1",
		exec,
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
		_inspect: inspect,
		_execStart: execStart,
	};
}

describe("ContainerCodeExecutor", () => {
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

	it("requires image or dockerPath", () => {
		expect(() => new ContainerCodeExecutor({})).toThrow(
			/Either image or dockerPath/,
		);
	});

	it("rejects stateful and optimizeDataFile", () => {
		expect(
			() => new ContainerCodeExecutor({ image: "img", stateful: true }),
		).toThrow(/stateful=true/);
		expect(
			() => new ContainerCodeExecutor({ image: "img", optimizeDataFile: true }),
		).toThrow(/optimizeDataFile=true/);
	});

	it("uses default image tag when only dockerPath is set and resolves path", () => {
		const executor = new ContainerCodeExecutor({ dockerPath: "." });
		expect(DockerMock).toHaveBeenCalledWith();
		expect((executor as any).image).toBe("adk-code-executor:latest");
		expect((executor as any).dockerPath).toMatch(/^\//);
		expect(executor.stateful).toBe(false);
		expect(executor.optimizeDataFile).toBe(false);
	});

	it("passes custom baseUrl to Docker client", () => {
		new ContainerCodeExecutor({
			image: "custom:tag",
			baseUrl: "tcp://localhost:2375",
		});
		expect(DockerMock).toHaveBeenCalledWith({
			host: "tcp://localhost:2375",
		});
	});

	it("executes code after initializing container and demuxes streams", async () => {
		const container = makeContainer();
		const stdoutChunk = Buffer.concat([
			Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]),
			Buffer.from("hello\n"),
		]);
		const stderrChunk = Buffer.concat([
			Buffer.from([2, 0, 0, 0, 0, 0, 0, 0]),
			Buffer.from("warn\n"),
		]);
		container._execStart.mockResolvedValue(
			makeStream([stdoutChunk, stderrChunk]),
		);
		createContainer.mockResolvedValue(container);

		const verifyInspect = vi.fn().mockResolvedValue({ ExitCode: 0 });
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: verifyInspect,
			})
			.mockResolvedValueOnce({
				start: container._execStart,
				inspect: container._inspect,
			});

		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout: 5000,
		});
		const result = await executor.executeCode({} as any, {
			code: "print(1)",
			inputFiles: [],
		});
		expect(createContainer).toHaveBeenCalled();
		expect(container.start).toHaveBeenCalled();
		expect(result.stdout).toBe("hello");
		expect(result.stderr).toBe("warn");
		expect(result.outputFiles).toEqual([]);

		await executor.executeCode({} as any, {
			code: "print(2)",
			inputFiles: [],
		});
		expect(createContainer).toHaveBeenCalledTimes(1);
	});

	it("returns timeout stderr when execution exceeds limit", async () => {
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
			executionTimeout: 50,
		});
		const pending = executor.executeCode({} as any, {
			code: "sleep",
			inputFiles: [],
		});
		await vi.advanceTimersByTimeAsync(60);
		const result = await pending;
		expect(result.stderr).toMatch(/timed out after 50ms/);
		vi.useRealTimers();
	});

	it("returns container execution error stderr for generic failures", async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockRejectedValueOnce(new Error("exec failed"));

		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const result = await executor.executeCode({} as any, {
			code: "x",
			inputFiles: [],
		});
		expect(result.stderr).toContain("Container execution error: exec failed");
	});

	it("buildDockerImage fails for missing path and follows progress on success", async () => {
		existsSync.mockReturnValueOnce(false);
		const executor = new ContainerCodeExecutor({ dockerPath: "/missing" });
		await expect((executor as any).buildDockerImage()).rejects.toThrow(
			/Invalid Docker path/,
		);

		existsSync.mockReturnValue(true);
		const stream = {};
		buildImage.mockResolvedValue(stream);
		followProgress.mockImplementation((_s: any, done: Function) => done(null));
		await expect((executor as any).buildDockerImage()).resolves.toBeUndefined();
		expect(buildImage).toHaveBeenCalled();
	});

	it("verifyPythonInstallation rejects non-zero exit", async () => {
		const container = makeContainer();
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		(executor as any).container = container;
		container.exec.mockResolvedValue({
			start: vi.fn().mockResolvedValue(makeStream([])),
			inspect: vi.fn().mockResolvedValue({ ExitCode: 1 }),
		});
		await expect((executor as any).verifyPythonInstallation()).rejects.toThrow(
			/python3 is not installed/,
		);
	});

	it("dispose stops and removes the container and swallows cleanup errors", async () => {
		const container = makeContainer();
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		(executor as any).container = container;
		(executor as any).isInitialized = true;
		await executor.dispose();
		expect(container.stop).toHaveBeenCalledWith({ t: 10 });
		expect(container.remove).toHaveBeenCalled();
		expect((executor as any).container).toBeUndefined();

		(executor as any).container = {
			id: "bad",
			stop: vi.fn().mockRejectedValue(new Error("already gone")),
			remove: vi.fn(),
		};
		await expect(executor.dispose()).resolves.toBeUndefined();
	});

	it("initContainer cleans up when start fails", async () => {
		createContainer.mockRejectedValue(new Error("no docker"));
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		await expect((executor as any).initContainer()).rejects.toThrow(
			"no docker",
		);
	});
});
