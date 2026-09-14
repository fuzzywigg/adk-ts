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

describe("ContainerCodeExecutor leftover: demux short chunks (<8 bytes)", () => {
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
		{ label: "empty buffer", chunk: Buffer.alloc(0), streamType: undefined },
		{ label: "1-byte stdout type", chunk: Buffer.from([1]), streamType: 1 },
		{
			label: "3-byte stderr type",
			chunk: Buffer.from([2, 0, 0]),
			streamType: 2,
		},
		{
			label: "7-byte stdout header fragment",
			chunk: Buffer.from([1, 0, 0, 0, 0, 0, 0]),
			streamType: 1,
		},
	])("collectOutput tolerates $label without throwing", async ({ chunk }) => {
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(makeStream([chunk]), {
			inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
		});
		expect(output.stdout).toBe("");
		expect(output.stderr).toBe("");
		expect(output.exitCode).toBe(0);
	});

	it("short stdout-type chunk then full frame still collects payload", async () => {
		const short = Buffer.from([1, 0, 0]);
		const full = Buffer.concat([
			Buffer.from([1, 0, 0, 0, 0, 0, 0, 3]),
			Buffer.from("hi\n"),
		]);
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(
			makeStream([short, full]),
			{ inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }) },
		);
		expect(output.stdout).toBe("hi");
		expect(output.stderr).toBe("");
	});

	it("short stderr-type chunk appends empty string then later frame", async () => {
		const short = Buffer.from([2]);
		const full = Buffer.concat([
			Buffer.from([2, 0, 0, 0, 0, 0, 0, 3]),
			Buffer.from("err"),
		]);
		const executor = new ContainerCodeExecutor({ image: "python:3" });
		const output = await (executor as any).collectOutput(
			makeStream([short, full]),
			{ inspect: vi.fn().mockResolvedValue({ ExitCode: 1 }) },
		);
		expect(output.stderr).toBe("err");
		expect(output.exitCode).toBe(1);
	});
});
