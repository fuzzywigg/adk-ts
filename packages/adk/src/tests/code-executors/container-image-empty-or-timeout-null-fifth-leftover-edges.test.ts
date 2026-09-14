import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { DockerMock, createContainer } = vi.hoisted(() => {
	const createContainer = vi.fn();
	const DockerMock = vi.fn(function Docker(
		this: any,
		opts?: { host?: string },
	) {
		this.host = opts?.host;
		this.createContainer = createContainer;
		this.buildImage = vi.fn();
		this.modem = { followProgress: vi.fn() };
	});
	return { DockerMock, createContainer };
});

vi.mock("dockerode", () => ({
	default: DockerMock,
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: vi.fn().mockReturnValue(true),
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

describe("ContainerCodeExecutor image || / timeout ?? fifth leftover (post #165)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ label: '""', image: "" },
		{ label: "null", image: null },
		{ label: "undefined with dockerPath", image: undefined },
	] as const)("image $label falls through || to DEFAULT_IMAGE_TAG when dockerPath set", ({
		image,
	}) => {
		const executor = new ContainerCodeExecutor({
			dockerPath: ".",
			image: image as any,
		});
		expect((executor as any).image).toBe("adk-code-executor:latest");
	});

	it.each([
		{ label: "null", executionTimeout: null, expected: 30_000 },
		{ label: "undefined", executionTimeout: undefined, expected: 30_000 },
	] as const)("executionTimeout $label coalesces via ?? to 30000", ({
		executionTimeout,
		expected,
	}) => {
		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout: executionTimeout as any,
		});
		expect((executor as any).executionTimeout).toBe(expected);
	});

	it("executionTimeout:0 is kept via ?? (asymmetry vs || which would default)", () => {
		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout: 0,
		});
		expect((executor as any).executionTimeout).toBe(0);
	});

	it.each([
		{ label: "null", ExitCode: null },
		{ label: "undefined", ExitCode: undefined },
		{ label: '""', ExitCode: "" },
		{ label: "0", ExitCode: 0 },
	] as const)("ExitCode || 0: $label yields exitCode 0", async ({
		ExitCode,
	}) => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(makeStream([]), {
			inspect: vi.fn().mockResolvedValue({ ExitCode }),
		});
		expect(output.exitCode).toBe(0);
	});

	it("ExitCode falsy empty object still || 0", async () => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(makeStream([]), {
			inspect: vi.fn().mockResolvedValue({ ExitCode: false }),
		});
		expect(output.exitCode).toBe(0);
	});
});
