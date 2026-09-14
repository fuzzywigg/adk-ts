import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { existsSync, DockerMock } = vi.hoisted(() => {
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

describe("ContainerCodeExecutor ExitCode || 0 falsy fifth leftover", () => {
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
		{ label: "null", ExitCode: null },
		{ label: "undefined", ExitCode: undefined },
		{ label: "false", ExitCode: false },
		{ label: "empty-string", ExitCode: "" },
		{ label: "NaN", ExitCode: Number.NaN },
	])("$label ExitCode coalesces to 0 via ||", async ({ ExitCode }) => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(makeStream([]), {
			inspect: vi.fn().mockResolvedValue({ ExitCode }),
		});
		expect(output.exitCode).toBe(0);
	});

	it("ExitCode: 0 stays 0 (falsy but intended success)", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(makeStream([]), {
			inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
		});
		expect(output.exitCode).toBe(0);
	});

	it.each([
		1, 2, 127, 255,
	])("nonzero ExitCode %s preserved (truthy || path)", async (ExitCode) => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(makeStream([]), {
			inspect: vi.fn().mockResolvedValue({ ExitCode }),
		});
		expect(output.exitCode).toBe(ExitCode);
	});

	it("missing ExitCode key (bare {}) coalesces to 0", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(makeStream([]), {
			inspect: vi.fn().mockResolvedValue({}),
		});
		expect(output.exitCode).toBe(0);
	});
});
