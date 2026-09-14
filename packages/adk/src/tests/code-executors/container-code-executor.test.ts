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
		followProgress.mockImplementation(
			(_s: any, done: (err: Error | null) => void) => done(null),
		);
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

	it("collectOutput rejects on stream error and on inspect failure", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const streamError = {
			on(event: string, cb: (...args: any[]) => void) {
				if (event === "error") {
					queueMicrotask(() => cb(new Error("stream broke")));
				}
				return this;
			},
		};
		await expect(
			(executor as any).collectOutput(streamError, {
				inspect: vi.fn(),
			}),
		).rejects.toThrow("stream broke");

		const inspectFail = {
			on(event: string, cb: (...args: any[]) => void) {
				if (event === "end") {
					queueMicrotask(() => cb());
				}
				return this;
			},
		};
		await expect(
			(executor as any).collectOutput(inspectFail, {
				inspect: vi.fn().mockRejectedValue(new Error("inspect down")),
			}),
		).rejects.toThrow("inspect down");
	});

	it("ignores non-stdout/stderr demux stream types", async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		const otherChunk = Buffer.concat([
			Buffer.from([3, 0, 0, 0, 0, 0, 0, 0]),
			Buffer.from("ignored"),
		]);
		const stdoutChunk = Buffer.concat([
			Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]),
			Buffer.from("kept\n"),
		]);
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([otherChunk, stdoutChunk])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			});

		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const result = await executor.executeCode({} as any, {
			code: "print(1)",
			inputFiles: [],
		});
		expect(result.stdout).toBe("kept");
		expect(result.stderr).toBe("");
	});

	it("maps non-Error execution failures to string stderr", async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec
			.mockResolvedValueOnce({
				start: vi.fn().mockResolvedValue(makeStream([])),
				inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
			})
			.mockRejectedValueOnce("plain-string-failure");

		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const result = await executor.executeCode({} as any, {
			code: "x",
			inputFiles: [],
		});
		expect(result.stderr).toContain(
			"Container execution error: plain-string-failure",
		);
	});

	it("buildDockerImage rejects missing dockerPath or client", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		await expect((executor as any).buildDockerImage()).rejects.toThrow(
			/Docker path is not set/,
		);

		const withPath = new ContainerCodeExecutor({ dockerPath: "." });
		(withPath as any).client = undefined;
		await expect((withPath as any).buildDockerImage()).rejects.toThrow(
			/Docker client is not initialized/,
		);
	});

	it("buildDockerImage rejects followProgress errors and logs stream events", async () => {
		existsSync.mockReturnValue(true);
		const executor = new ContainerCodeExecutor({ dockerPath: "." });
		buildImage.mockResolvedValue({});
		followProgress.mockImplementation(
			(
				_s: any,
				done: (err: Error | null) => void,
				onProgress?: (event: any) => void,
			) => {
				onProgress?.({ stream: "Step 1/2\n" });
				onProgress?.({ status: "silent" });
				done(new Error("build failed"));
			},
		);
		await expect((executor as any).buildDockerImage()).rejects.toThrow(
			"build failed",
		);
	});

	it("verifyPythonInstallation requires a container and wraps stream failures", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		await expect((executor as any).verifyPythonInstallation()).rejects.toThrow(
			/Container is not initialized/,
		);

		const container = makeContainer();
		(executor as any).container = container;
		container.exec.mockResolvedValue({
			start: vi.fn().mockResolvedValue({
				on(event: string, cb: (...args: any[]) => void) {
					if (event === "error") {
						queueMicrotask(() => cb(new Error("pipe closed")));
					}
					return this;
				},
			}),
			inspect: vi.fn(),
		});
		await expect((executor as any).verifyPythonInstallation()).rejects.toThrow(
			/python3 is not installed/,
		);

		container.exec.mockResolvedValue({
			start: vi.fn().mockResolvedValue(makeStream([])),
			inspect: vi.fn().mockRejectedValue(new Error("inspect boom")),
		});
		await expect((executor as any).verifyPythonInstallation()).rejects.toThrow(
			/python3 is not installed/,
		);
	});

	it("initContainer builds from dockerPath then verifies python", async () => {
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
		expect(buildImage).toHaveBeenCalled();
		expect(createContainer).toHaveBeenCalledWith(
			expect.objectContaining({ Image: "adk-code-executor:latest" }),
		);
		expect((executor as any).container).toBe(container);
	});

	it("initContainer rejects when Docker client is missing", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		(executor as any).client = undefined;
		await expect((executor as any).initContainer()).rejects.toThrow(
			/Docker client is not initialized/,
		);
	});

	it("cleanupContainer no-ops without a container and process handlers trigger cleanup", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		await expect((executor as any).cleanupContainer()).resolves.toBeUndefined();

		const container = makeContainer();
		(executor as any).container = container;
		(executor as any).isInitialized = true;

		const exitHandler = listeners.find(([event]) => event === "exit")?.[1];
		const sigintHandler = listeners.find(([event]) => event === "SIGINT")?.[1];
		const sigtermHandler = listeners.find(
			([event]) => event === "SIGTERM",
		)?.[1];
		const uncaughtHandler = listeners.find(
			([event]) => event === "uncaughtException",
		)?.[1];

		expect(exitHandler).toBeTypeOf("function");
		expect(sigintHandler).toBeTypeOf("function");
		expect(sigtermHandler).toBeTypeOf("function");
		expect(uncaughtHandler).toBeTypeOf("function");

		exitHandler?.();
		await vi.waitFor(() => {
			expect(container.stop).toHaveBeenCalled();
		});
	});

	it("executeCode surfaces missing container after a fake initialized flag", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		(executor as any).isInitialized = true;
		(executor as any).container = undefined;
		await expect(
			executor.executeCode({} as any, { code: "x", inputFiles: [] }),
		).rejects.toThrow(/Container is not initialized/);
	});

	it("uses custom executionTimeout default of 30000 when unset", () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		expect((executor as any).executionTimeout).toBe(30000);
	});

	it("honors custom executionTimeout and baseUrl host wiring", () => {
		const executor = new ContainerCodeExecutor({
			image: "python:3.12",
			baseUrl: "http://docker.local:2375",
			executionTimeout: 12_000,
		});
		expect((executor as any).executionTimeout).toBe(12_000);
		expect((executor as any).baseUrl).toBe("http://docker.local:2375");
		expect((executor as any).image).toBe("python:3.12");
		expect(DockerMock).toHaveBeenCalledWith({
			host: "http://docker.local:2375",
		});
	});

	it("forces stateful and optimizeDataFile off even if omitted", () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		expect(executor.stateful).toBe(false);
		expect(executor.optimizeDataFile).toBe(false);
	});

	it("executeCode returns stdout/stderr from container streams", async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container._execStart.mockResolvedValue(
			makeStream([Buffer.from("hello-out"), Buffer.from("")]),
		);
		container._inspect.mockResolvedValue({ ExitCode: 0 });

		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const result = await executor.executeCode({} as any, {
			code: "print('hello-out')",
			inputFiles: [],
		});
		expect(result.stdout.length).toBeGreaterThanOrEqual(0);
		expect(result.stderr).toBeDefined();
		expect(result.outputFiles).toEqual([]);
	});

	it("ensureInitialized is idempotent after first success", async () => {
		const container = makeContainer();
		createContainer.mockResolvedValue(container);
		container.exec.mockResolvedValue({
			start: vi.fn().mockResolvedValue(makeStream([])),
			inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
		});
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		await (executor as any).ensureInitialized();
		await (executor as any).ensureInitialized();
		expect(createContainer).toHaveBeenCalledTimes(1);
	});

	it("buildDockerImage rejects missing dockerPath and missing client", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		await expect((executor as any).buildDockerImage()).rejects.toThrow(
			/Docker path is not set/,
		);

		const withPath = new ContainerCodeExecutor({ dockerPath: "." });
		(withPath as any).client = undefined;
		existsSync.mockReturnValue(true);
		await expect((withPath as any).buildDockerImage()).rejects.toThrow(
			/Docker client is not initialized/,
		);
	});

	it("buildDockerImage rejects invalid docker path", async () => {
		existsSync.mockReturnValue(false);
		const executor = new ContainerCodeExecutor({ dockerPath: "./missing" });
		await expect((executor as any).buildDockerImage()).rejects.toThrow(
			/Invalid Docker path/,
		);
	});

	it("collectOutput demuxes docker headers and returns exit code", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const stdoutChunk = Buffer.concat([
			Buffer.from([1, 0, 0, 0, 0, 0, 0, 3]),
			Buffer.from("abc"),
		]);
		const stderrChunk = Buffer.concat([
			Buffer.from([2, 0, 0, 0, 0, 0, 0, 3]),
			Buffer.from("err"),
		]);
		const stream = makeStream([stdoutChunk, stderrChunk]);
		const exec = {
			inspect: vi.fn().mockResolvedValue({ ExitCode: 7 }),
		};
		const output = await (executor as any).collectOutput(stream, exec);
		expect(output).toEqual({
			stdout: "abc",
			stderr: "err",
			exitCode: 7,
		});
	});

	it("collectOutput rejects on stream error events", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const stream = {
			on(event: string, cb: (...args: any[]) => void) {
				if (event === "error") {
					queueMicrotask(() => cb(new Error("stream broke")));
				}
				return this;
			},
		};
		await expect(
			(executor as any).collectOutput(stream, {
				inspect: vi.fn(),
			}),
		).rejects.toThrow(/stream broke/);
	});

	it("collectOutput rejects when exec.inspect fails after end", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const stream = makeStream([]);
		await expect(
			(executor as any).collectOutput(stream, {
				inspect: vi.fn().mockRejectedValue(new Error("inspect failed")),
			}),
		).rejects.toThrow(/inspect failed/);
	});

	it("collectOutput treats missing ExitCode as 0", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const stream = makeStream([]);
		const output = await (executor as any).collectOutput(stream, {
			inspect: vi.fn().mockResolvedValue({}),
		});
		expect(output.exitCode).toBe(0);
	});

	it("createTimeoutPromise rejects with timeout message", async () => {
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

	it("resolves dockerPath to an absolute path", () => {
		const executor = new ContainerCodeExecutor({ dockerPath: "." });
		expect((executor as any).dockerPath).toMatch(/^\//);
	});

	it("defaults image tag when only dockerPath is provided", () => {
		const executor = new ContainerCodeExecutor({ dockerPath: "." });
		expect((executor as any).image).toBe("adk-code-executor:latest");
	});

	it("dispose is safe to call multiple times", async () => {
		const container = makeContainer();
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		(executor as any).container = container;
		(executor as any).isInitialized = true;
		await executor.dispose();
		await executor.dispose();
		expect(container.stop).toHaveBeenCalled();
		expect(container.remove).toHaveBeenCalled();
	});

	it("rejects optimizeDataFile=true at construction", () => {
		expect(
			() =>
				new ContainerCodeExecutor({
					image: "python:3",
					optimizeDataFile: true,
				}),
		).toThrow(/optimizeDataFile/);
	});

	it("rejects stateful=true at construction", () => {
		expect(
			() => new ContainerCodeExecutor({ image: "python:3", stateful: true }),
		).toThrow(/stateful/);
	});
});
