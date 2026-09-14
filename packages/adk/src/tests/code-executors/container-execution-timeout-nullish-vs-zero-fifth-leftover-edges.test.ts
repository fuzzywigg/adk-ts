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

describe("ContainerCodeExecutor executionTimeout ?? vs || fifth leftover", () => {
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

	it("keeps executionTimeout: 0 via ?? (would fall through under ||)", () => {
		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout: 0,
		});
		expect((executor as any).executionTimeout).toBe(0);
	});

	it.each([
		{ label: "null", executionTimeout: null as any },
		{ label: "undefined", executionTimeout: undefined },
	])("$label executionTimeout falls back to 30000 via ??", ({
		executionTimeout,
	}) => {
		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout,
		});
		expect((executor as any).executionTimeout).toBe(30_000);
	});

	it("createTimeoutPromise with 0 rejects immediately on next timer tick", async () => {
		vi.useFakeTimers();
		const executor = new ContainerCodeExecutor({
			image: "python:3",
			executionTimeout: 0,
		});
		const pending = (executor as any).createTimeoutPromise();
		const expectation = expect(pending).rejects.toThrow(
			/Code execution timed out after 0ms/,
		);
		await vi.advanceTimersByTimeAsync(0);
		await expectation;
		vi.useRealTimers();
	});

	it("documents asymmetry vs image || DEFAULT: empty image coalesces, zero timeout kept", () => {
		const executor = new ContainerCodeExecutor({
			image: "",
			dockerPath: ".",
			executionTimeout: 0,
		});
		expect((executor as any).image).toBe("adk-code-executor:latest");
		expect((executor as any).executionTimeout).toBe(0);
	});
});
