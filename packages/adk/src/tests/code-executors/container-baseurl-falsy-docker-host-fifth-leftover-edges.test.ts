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

describe("ContainerCodeExecutor baseUrl falsy Docker host fifth leftover", () => {
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
		{ label: "empty-string", baseUrl: "" },
		{ label: "null", baseUrl: null as any },
		{ label: "undefined", baseUrl: undefined },
		{ label: "false", baseUrl: false as any },
		{ label: "0", baseUrl: 0 as any },
	])("$label baseUrl skips host option (truthy ? host : bare)", ({
		baseUrl,
	}) => {
		new ContainerCodeExecutor({ image: "python:3", baseUrl });
		expect(DockerMock).toHaveBeenCalledWith();
		expect(DockerMock).not.toHaveBeenCalledWith(
			expect.objectContaining({ host: expect.anything() }),
		);
	});

	it("whitespace-only baseUrl is truthy and wires host", () => {
		new ContainerCodeExecutor({
			image: "python:3",
			baseUrl: "   ",
		});
		expect(DockerMock).toHaveBeenCalledWith({ host: "   " });
	});

	it("stores falsy baseUrl on instance as-is", () => {
		const executor = new ContainerCodeExecutor({
			image: "python:3",
			baseUrl: "",
		});
		expect((executor as any).baseUrl).toBe("");
	});

	it("truthy tcp baseUrl wires host", () => {
		new ContainerCodeExecutor({
			image: "python:3",
			baseUrl: "tcp://127.0.0.1:2375",
		});
		expect(DockerMock).toHaveBeenCalledWith({
			host: "tcp://127.0.0.1:2375",
		});
	});
});
