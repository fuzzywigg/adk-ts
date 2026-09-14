import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	existsSyncMock,
	downloadTemplateMock,
	textMock,
	selectMock,
	confirmMock,
	spinnerMock,
	introMock,
	outroMock,
	spawnMock,
} = vi.hoisted(() => ({
	existsSyncMock: vi.fn(),
	downloadTemplateMock: vi.fn(),
	textMock: vi.fn(),
	selectMock: vi.fn(),
	confirmMock: vi.fn(),
	spinnerMock: vi.fn(),
	introMock: vi.fn(),
	outroMock: vi.fn(),
	spawnMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
	existsSync: existsSyncMock,
}));

vi.mock("giget", () => ({
	downloadTemplate: downloadTemplateMock,
}));

vi.mock("@clack/prompts", () => ({
	intro: introMock,
	outro: outroMock,
	text: textMock,
	select: selectMock,
	confirm: confirmMock,
	spinner: spinnerMock,
}));

vi.mock("node:child_process", () => ({
	spawn: spawnMock,
}));

import { NewCommand } from "../../cli/new.command";

function makeSpinner() {
	return {
		start: vi.fn(),
		stop: vi.fn(),
	};
}

function makeSpawnChild(options: {
	closeCode?: number | null;
	emitError?: Error;
	versionOk?: boolean;
}) {
	const child = new EventEmitter() as EventEmitter & {
		stdout?: unknown;
		stderr?: unknown;
	};
	queueMicrotask(() => {
		if (options.emitError) {
			child.emit("error", options.emitError);
			return;
		}
		child.emit("close", options.closeCode ?? (options.versionOk ? 0 : 1));
	});
	return child;
}

describe("NewCommand leftover edges (TOKENMAXX adk-cli)", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let clearSpy: ReturnType<typeof vi.spyOn>;
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		existsSyncMock.mockReturnValue(false);
		downloadTemplateMock.mockResolvedValue(undefined);
		spinnerMock.mockImplementation(() => makeSpinner());
		confirmMock.mockResolvedValue(false);
		exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);
		clearSpy = vi.spyOn(console, "clear").mockImplementation(() => undefined);
		logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		spawnMock.mockImplementation((command: string, args: string[]) => {
			if (Array.isArray(args) && args[0] === "--version") {
				return makeSpawnChild({ versionOk: command === "npm" });
			}
			return makeSpawnChild({ closeCode: 0 });
		});
	});

	afterEach(() => {
		exitSpy.mockRestore();
		clearSpy.mockRestore();
		logSpy.mockRestore();
	});

	it("includes the skipped install command in the success outro", async () => {
		confirmMock.mockResolvedValue(false);
		const command = new NewCommand();
		await command.run(["proj"], { template: "simple-agent" });
		expect(outroMock).toHaveBeenCalledWith(
			expect.stringContaining("npm install"),
		);
	});

	it("omits the install command from the outro after a successful install", async () => {
		confirmMock.mockResolvedValue(true);
		const command = new NewCommand();
		await command.run(["proj"], { template: "telegram-bot" });
		expect(downloadTemplateMock).toHaveBeenCalledWith(
			expect.stringContaining("telegram-bot"),
			expect.any(Object),
		);
		expect(outroMock).toHaveBeenCalled();
		expect(String(outroMock.mock.calls[0][0])).not.toMatch(/npm install/);
	});

	it("treats package-manager version spawn errors as unavailable", async () => {
		spawnMock.mockImplementation(() =>
			makeSpawnChild({ emitError: new Error("ENOENT") }),
		);
		confirmMock.mockResolvedValue(false);
		const command = new NewCommand();
		await command.run(["proj"], { template: "mcp-starter" });
		expect(outroMock).toHaveBeenCalled();
	});

	it("downloads shade-agent and next-js-starter sources", async () => {
		const command = new NewCommand();
		await command.run(["shade"], { template: "shade-agent" });
		expect(downloadTemplateMock).toHaveBeenCalledWith(
			expect.stringContaining("shade-agent"),
			expect.any(Object),
		);

		downloadTemplateMock.mockClear();
		await command.run(["next"], { template: "next-js-starter" });
		expect(downloadTemplateMock).toHaveBeenCalledWith(
			expect.stringContaining("next-js-starter"),
			expect.any(Object),
		);
	});

	it("resolves a package manager name after a multi-manager prompt", async () => {
		spawnMock.mockImplementation(() => makeSpawnChild({ versionOk: true }));
		selectMock.mockResolvedValue("yarn");
		confirmMock.mockResolvedValue(true);

		const command = new NewCommand();
		await command.run(["proj"], { template: "simple-agent" });

		expect(spawnMock).toHaveBeenCalledWith(
			"yarn",
			["install"],
			expect.objectContaining({ stdio: "pipe" }),
		);
	});
});
