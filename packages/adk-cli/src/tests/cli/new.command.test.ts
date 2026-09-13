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

describe("NewCommand", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let clearSpy: ReturnType<typeof vi.spyOn>;
	let logSpy: ReturnType<typeof vi.spyOn>;
	const originalExit = process.exit;

	beforeEach(() => {
		vi.clearAllMocks();
		existsSyncMock.mockReturnValue(false);
		downloadTemplateMock.mockResolvedValue(undefined);
		spinnerMock.mockImplementation(() => makeSpinner());
		confirmMock.mockResolvedValue(false);
		exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);
		clearSpy = vi.spyOn(console, "clear").mockImplementation(() => {});
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
		process.exit = originalExit;
	});

	it("parseTemplate returns the raw value", () => {
		const command = new NewCommand();
		expect(command.parseTemplate("simple-agent")).toBe("simple-agent");
	});

	it("prompts for project name when argument is missing", async () => {
		textMock.mockResolvedValue("my-project");
		selectMock.mockResolvedValue("simple-agent");

		const command = new NewCommand();
		await command.run([], { template: "simple-agent" });

		expect(textMock).toHaveBeenCalled();
		expect(downloadTemplateMock).toHaveBeenCalledWith(
			expect.stringContaining("simple-agent"),
			expect.objectContaining({ dir: "my-project", registry: "gh" }),
		);
		expect(outroMock).toHaveBeenCalled();
	});

	it("exits when project name prompt is cancelled", async () => {
		textMock.mockResolvedValue(Symbol("cancel"));

		const command = new NewCommand();
		await expect(command.run([])).rejects.toThrow("process.exit");
		expect(outroMock).toHaveBeenCalledWith("Operation cancelled");
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it("exits when template selection is cancelled", async () => {
		selectMock.mockResolvedValue(Symbol("cancel"));

		const command = new NewCommand();
		await expect(command.run(["proj"])).rejects.toThrow("process.exit");
		expect(outroMock).toHaveBeenCalledWith("Operation cancelled");
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it("prompts for template when flag is unknown", async () => {
		selectMock.mockResolvedValue("discord-bot");

		const command = new NewCommand();
		await command.run(["proj"], { template: "not-a-real-template" });

		expect(selectMock).toHaveBeenCalled();
		expect(downloadTemplateMock).toHaveBeenCalledWith(
			expect.stringContaining("discord-bot"),
			expect.any(Object),
		);
	});

	it("exits when directory already exists", async () => {
		existsSyncMock.mockReturnValue(true);

		const command = new NewCommand();
		await expect(
			command.run(["existing"], { template: "simple-agent" }),
		).rejects.toThrow("process.exit");
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(downloadTemplateMock).not.toHaveBeenCalled();
	});

	it("exits when template download fails", async () => {
		downloadTemplateMock.mockRejectedValue(new Error("network down"));

		const command = new NewCommand();
		await expect(
			command.run(["proj"], { template: "simple-agent" }),
		).rejects.toThrow("process.exit");
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("selects among multiple package managers and skips install", async () => {
		spawnMock.mockImplementation(() => makeSpawnChild({ versionOk: true }));
		selectMock.mockResolvedValue("pnpm");
		confirmMock.mockResolvedValue(false);

		const command = new NewCommand();
		await command.run(["proj"], { template: "simple-agent" });

		expect(selectMock).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Which package manager would you like to use?",
			}),
		);
		expect(confirmMock).toHaveBeenCalled();
		expect(outroMock).toHaveBeenCalled();
	});

	it("exits when package manager selection is cancelled", async () => {
		spawnMock.mockImplementation(() => makeSpawnChild({ versionOk: true }));
		selectMock.mockResolvedValue(Symbol("cancel"));

		const command = new NewCommand();
		await expect(
			command.run(["proj"], { template: "simple-agent" }),
		).rejects.toThrow("process.exit");
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it("exits when install confirm is cancelled", async () => {
		confirmMock.mockResolvedValue(Symbol("cancel"));

		const command = new NewCommand();
		await expect(
			command.run(["proj"], { template: "simple-agent" }),
		).rejects.toThrow("process.exit");
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it("installs dependencies successfully with the only available manager", async () => {
		confirmMock.mockResolvedValue(true);
		spawnMock.mockImplementation((command: string, args: string[]) => {
			if (Array.isArray(args) && args[0] === "--version") {
				return makeSpawnChild({ versionOk: command === "npm" });
			}
			return makeSpawnChild({ closeCode: 0 });
		});

		const command = new NewCommand();
		await command.run(["proj"], { template: "simple-agent" });

		expect(spawnMock).toHaveBeenCalledWith(
			"npm",
			["install"],
			expect.objectContaining({ stdio: "pipe" }),
		);
		expect(outroMock).toHaveBeenCalled();
	});

	it("prints manual install guidance when install exits non-zero", async () => {
		confirmMock.mockResolvedValue(true);
		spawnMock.mockImplementation((command: string, args: string[]) => {
			if (Array.isArray(args) && args[0] === "--version") {
				return makeSpawnChild({ versionOk: command === "npm" });
			}
			return makeSpawnChild({ closeCode: 1 });
		});

		const command = new NewCommand();
		await command.run(["proj"], { template: "simple-agent" });

		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("install dependencies manually"),
		);
		expect(outroMock).toHaveBeenCalled();
	});

	it("prints manual install guidance when install spawn errors", async () => {
		confirmMock.mockResolvedValue(true);
		spawnMock.mockImplementation((command: string, args: string[]) => {
			if (Array.isArray(args) && args[0] === "--version") {
				return makeSpawnChild({ versionOk: command === "npm" });
			}
			return makeSpawnChild({ emitError: new Error("ENOENT") });
		});

		const command = new NewCommand();
		await command.run(["proj"], { template: "simple-agent" });

		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("install dependencies manually"),
		);
	});

	it("falls back to npm when no package managers are detectable", async () => {
		spawnMock.mockImplementation(() => makeSpawnChild({ closeCode: 1 }));
		confirmMock.mockResolvedValue(false);

		const command = new NewCommand();
		await command.run(["proj"], { template: "hono-server" });

		expect(downloadTemplateMock).toHaveBeenCalledWith(
			expect.stringContaining("hono-server"),
			expect.any(Object),
		);
		expect(outroMock).toHaveBeenCalled();
	});

	it("validates prompted project names for emptiness, spaces, and existing dirs", async () => {
		textMock.mockResolvedValue("ok-name");
		selectMock.mockResolvedValue("simple-agent");
		confirmMock.mockResolvedValue(false);

		const command = new NewCommand();
		await command.run([], { template: "simple-agent" });

		const validate = textMock.mock.calls[0][0].validate as (
			value: string,
		) => string | undefined;
		expect(validate("")).toMatch(/required/i);
		expect(validate("has space")).toMatch(/spaces/i);
		existsSyncMock.mockReturnValueOnce(true);
		expect(validate("taken")).toMatch(/already exists/i);
		existsSyncMock.mockReturnValue(false);
		expect(validate("good-name")).toBeUndefined();
	});
});
