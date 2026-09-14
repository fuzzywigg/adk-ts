import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleManager } from "../../cli/run.command";

describe("ConsoleManager leftover edges (TOKENMAXX adk-cli)", () => {
	let manager: ConsoleManager;
	const originalLog = console.log;
	const originalInfo = console.info;
	const originalWarn = console.warn;
	const originalError = console.error;
	const originalDebug = console.debug;
	const originalStdout = process.stdout.write;
	const originalStderr = process.stderr.write;

	beforeEach(() => {
		manager = new ConsoleManager(false);
	});

	afterEach(() => {
		try {
			manager.restore();
		} catch {}
		console.log = originalLog;
		console.info = originalInfo;
		console.warn = originalWarn;
		console.error = originalError;
		console.debug = originalDebug;
		process.stdout.write = originalStdout;
		process.stderr.write = originalStderr;
	});

	it("skips a second hookConsole and skips after destroy", () => {
		const log = vi.fn();
		console.log = log;
		manager.hookConsole();
		manager.hookConsole();
		console.log("hidden");
		expect(log).not.toHaveBeenCalled();
		manager.restore();
		manager.hookConsole();
		console.log("after-destroy");
		expect(log).toHaveBeenCalledWith("after-destroy");
	});

	it("lets stdout and stderr through while outputAllowed is true", async () => {
		const out: string[] = [];
		const err: string[] = [];
		process.stdout.write = ((chunk: unknown) => {
			out.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;
		process.stderr.write = ((chunk: unknown) => {
			err.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;

		manager.hookConsole();
		await manager.withAllowedOutput(() => {
			process.stdout.write("allowed-out\n");
			process.stderr.write("allowed-err\n");
		});

		expect(out).toEqual(["allowed-out\n"]);
		expect(err).toEqual(["allowed-err\n"]);
	});

	it("treats carriage-return stdout as important UI output", () => {
		const writes: string[] = [];
		process.stdout.write = ((chunk: unknown) => {
			writes.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;
		manager.hookConsole();
		process.stdout.write("progress\r");
		expect(writes).toEqual(["progress\r"]);
	});

	it("skips child-process hook when verbose, already hooked, or destroyed", () => {
		const verbose = new ConsoleManager(true);
		verbose.hookChildProcessSilence();
		verbose.restore();

		manager.hookChildProcessSilence();
		manager.hookChildProcessSilence();
		manager.restore();
		manager.hookChildProcessSilence();
	});

	it("patches array stdio for noisy MCP commands and ignores missing command", () => {
		const cp = require("node:child_process") as {
			spawn: (...args: unknown[]) => unknown;
		};
		const originalSpawn = cp.spawn;
		const spawnSpy = vi.fn().mockReturnValue({ pid: 1 });
		cp.spawn = spawnSpy;

		try {
			manager.hookChildProcessSilence();
			cp.spawn(undefined as unknown as string, ["x"]);
			expect(spawnSpy).toHaveBeenCalledWith(undefined, ["x"], undefined);

			spawnSpy.mockClear();
			cp.spawn("npx", ["@iqai/mcp", "serve"], {
				stdio: ["inherit", "inherit", "inherit"],
			});
			expect(spawnSpy).toHaveBeenCalledWith(
				"npx",
				["@iqai/mcp", "serve"],
				expect.objectContaining({
					stdio: ["inherit", "pipe", "pipe"],
				}),
			);

			spawnSpy.mockClear();
			cp.spawn("modelcontextprotocol", undefined, { stdio: ["pipe"] });
			expect(spawnSpy).toHaveBeenCalledWith(
				"modelcontextprotocol",
				expect.objectContaining({
					stdio: ["pipe", "pipe", "pipe"],
				}),
			);
		} finally {
			manager.restore();
			cp.spawn = originalSpawn;
		}
	});

	it("falls back to the original spawn when the silenced spawn throws", () => {
		const cp = require("node:child_process") as {
			spawn: (...args: unknown[]) => unknown;
		};
		const originalSpawn = cp.spawn;
		const spawnSpy = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new Error("patched spawn failed");
			})
			.mockReturnValue({ pid: 2 });
		cp.spawn = spawnSpy;

		try {
			manager.hookChildProcessSilence();
			const result = cp.spawn("mcp-remote", ["x"], { stdio: "inherit" });
			expect(result).toEqual({ pid: 2 });
			expect(spawnSpy).toHaveBeenCalledTimes(2);
		} finally {
			manager.restore();
			cp.spawn = originalSpawn;
		}
	});

	it("restore logs via originals.error when console restore throws", () => {
		manager.hookConsole();
		const error = vi.fn();
		(manager as unknown as { originals: Record<string, unknown> }).originals = {
			get log() {
				throw new Error("restore fail");
			},
			error,
		};
		expect(() => manager.restore()).not.toThrow();
		expect(error).toHaveBeenCalled();
	});

	it("restore writes stderr when originals.error is missing", () => {
		manager.hookConsole();
		const writes: string[] = [];
		process.stderr.write = ((chunk: unknown) => {
			writes.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;
		(manager as unknown as { originals: Record<string, unknown> }).originals = {
			get log() {
				throw new Error("restore fail");
			},
		};
		expect(() => manager.restore()).not.toThrow();
		expect(writes.some((w) => w.includes("ConsoleManager restore"))).toBe(true);
	});

	it("printAnswer and error use live writers when originals were never hooked", () => {
		const verbose = new ConsoleManager(true);
		const out: string[] = [];
		const err: string[] = [];
		process.stdout.write = ((chunk: unknown) => {
			out.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;
		process.stderr.write = ((chunk: unknown) => {
			err.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;

		verbose.error("plain-err");
		verbose.printAnswer("plain-out");
		expect(err.some((e) => e.includes("plain-err"))).toBe(true);
		expect(out.join("")).toMatch(/plain-out/i);
		verbose.restore();
	});

	it("renderMarkdown stringifies non-string marked output", () => {
		const rendered = manager.renderMarkdown("x");
		expect(typeof rendered).toBe("string");
	});
});
