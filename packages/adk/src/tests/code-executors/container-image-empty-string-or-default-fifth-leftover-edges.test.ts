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

const DEFAULT_IMAGE_TAG = "adk-code-executor:latest";

describe("ContainerCodeExecutor image || DEFAULT fifth leftover", () => {
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

	it("empty-string image with dockerPath coalesces to DEFAULT via ||", () => {
		const executor = new ContainerCodeExecutor({
			image: "",
			dockerPath: ".",
		});
		expect((executor as any).image).toBe(DEFAULT_IMAGE_TAG);
	});

	it.each([
		{ label: "null", image: null as any },
		{ label: "undefined", image: undefined },
	])("$label image with dockerPath coalesces to DEFAULT", ({ image }) => {
		const executor = new ContainerCodeExecutor({
			image,
			dockerPath: ".",
		});
		expect((executor as any).image).toBe(DEFAULT_IMAGE_TAG);
	});

	it("empty-string image alone fails validation (!image && !dockerPath)", () => {
		expect(() => new ContainerCodeExecutor({ image: "" })).toThrow(
			/Either image or dockerPath/,
		);
	});

	it("whitespace-only image is truthy and kept (|| does not trim)", () => {
		const executor = new ContainerCodeExecutor({ image: "   " });
		expect((executor as any).image).toBe("   ");
	});

	it("truthy image zero-ish string '0' is kept", () => {
		const executor = new ContainerCodeExecutor({ image: "0" });
		expect((executor as any).image).toBe("0");
	});

	it("empty-string image + dockerPath still resolves dockerPath", () => {
		const executor = new ContainerCodeExecutor({
			image: "",
			dockerPath: "./docker",
		});
		expect((executor as any).image).toBe(DEFAULT_IMAGE_TAG);
		expect((executor as any).dockerPath).toMatch(/docker$/);
	});
});
