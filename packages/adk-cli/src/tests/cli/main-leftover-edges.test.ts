import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runMock } = vi.hoisted(() => ({
	runMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("nest-commander", async (importOriginal) => {
	const actual = await importOriginal<typeof import("nest-commander")>();
	return {
		...actual,
		CommandFactory: {
			...actual.CommandFactory,
			run: (...args: unknown[]) => runMock(...args),
		},
	};
});

describe("main leftover edges (TOKENMAXX adk-cli)", () => {
	const originalArgv = process.argv.slice();
	const originalDebug = process.env.ADK_DEBUG;
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		runMock.mockClear();
		runMock.mockResolvedValue(undefined);
		process.env.NODE_ENV = "development";
		vi.resetModules();
	});

	afterEach(() => {
		process.argv = originalArgv;
		if (originalNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = originalNodeEnv;
		}
		if (originalDebug === undefined) {
			delete process.env.ADK_DEBUG;
		} else {
			process.env.ADK_DEBUG = originalDebug;
		}
		vi.restoreAllMocks();
	});

	async function loadMain(): Promise<void> {
		await import("../../main");
		await Promise.resolve();
	}

	it("prints package version for --version, -v, and -V then still bootstraps", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const exit = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);
		const pkg = await import("../../../package.json");

		for (const flag of ["--version", "-v", "-V"]) {
			log.mockClear();
			exit.mockClear();
			runMock.mockClear();
			vi.resetModules();
			process.argv = ["node", "adk", flag];
			await loadMain();
			expect(log).toHaveBeenCalledWith(pkg.version || "unknown");
			expect(exit).toHaveBeenCalledWith(0);
			expect(runMock).toHaveBeenCalled();
		}
	});

	it("continues bootstrap when version handling throws", async () => {
		process.argv = ["node", "adk", "--version"];
		vi.spyOn(console, "log").mockImplementation(() => {
			throw new Error("print failed");
		});
		vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

		await loadMain();
		expect(runMock).toHaveBeenCalled();
	});

	it("uses debug nest logger when ADK_DEBUG=true", async () => {
		process.argv = ["node", "adk", "help"];
		process.env.ADK_DEBUG = "true";
		vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

		await loadMain();
		expect(runMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				logger: ["log", "error", "warn", "debug", "verbose"],
			}),
		);
	});

	it("keeps error/warn logger when ADK_DEBUG is unset", async () => {
		process.argv = ["node", "adk"];
		delete process.env.ADK_DEBUG;
		vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

		await loadMain();
		expect(runMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				logger: ["error", "warn"],
			}),
		);
	});
});
