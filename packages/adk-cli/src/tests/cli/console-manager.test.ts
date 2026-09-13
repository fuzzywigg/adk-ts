import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleManager } from "../../cli/run.command";

describe("ConsoleManager", () => {
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
		manager.restore();
		console.log = originalLog;
		console.info = originalInfo;
		console.warn = originalWarn;
		console.error = originalError;
		console.debug = originalDebug;
		process.stdout.write = originalStdout;
		process.stderr.write = originalStderr;
	});

	it("skips hooking when verbose is enabled", () => {
		const verbose = new ConsoleManager(true);
		const log = vi.fn();
		console.log = log;
		verbose.hookConsole();
		console.log("visible");
		expect(log).toHaveBeenCalledWith("visible");
		verbose.restore();
	});

	it("silences console.log/info/debug but allows warn and error", () => {
		const log = vi.fn();
		const info = vi.fn();
		const debug = vi.fn();
		const warn = vi.fn();
		const error = vi.fn();
		console.log = log;
		console.info = info;
		console.debug = debug;
		console.warn = warn;
		console.error = error;

		manager.hookConsole();
		console.log("hidden");
		console.info("hidden");
		console.debug("hidden");
		console.warn("shown");
		console.error("shown");

		expect(log).not.toHaveBeenCalled();
		expect(info).not.toHaveBeenCalled();
		expect(debug).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith("shown");
		expect(error).toHaveBeenCalledWith("shown");
	});

	it("allows important stdout patterns and silences ordinary output", () => {
		const writes: string[] = [];
		process.stdout.write = ((chunk: any) => {
			writes.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;

		manager.hookConsole();
		process.stdout.write("noise line\n");
		process.stdout.write("⠋ spinner\n");
		process.stdout.write("🤖 agent\n");
		process.stdout.write("Thinking...\n");
		process.stdout.write("?\n");
		process.stdout.write("\x1b[31mansi\n");
		process.stdout.write("error happened\n");

		expect(writes.some((w) => w.includes("noise"))).toBe(false);
		expect(writes.some((w) => w.includes("spinner"))).toBe(true);
		expect(writes.some((w) => w.includes("🤖"))).toBe(true);
		expect(writes.some((w) => w.includes("Thinking"))).toBe(true);
		expect(writes.some((w) => w.includes("?"))).toBe(true);
		expect(writes.some((w) => w.includes("ansi"))).toBe(true);
		expect(writes.some((w) => w.includes("error"))).toBe(true);
	});

	it("filters stderr to error-like content only", () => {
		const writes: string[] = [];
		process.stderr.write = ((chunk: any) => {
			writes.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;

		manager.hookConsole();
		process.stderr.write("benign note\n");
		process.stderr.write("warning: something\n");
		process.stderr.write("failed to connect\n");
		process.stderr.write("ERROR boom\n");

		expect(writes).toEqual([
			"warning: something\n",
			"failed to connect\n",
			"ERROR boom\n",
		]);
	});

	it("withAllowedOutput temporarily unsilences streams and restores after", async () => {
		const writes: string[] = [];
		process.stdout.write = ((chunk: any) => {
			writes.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;

		manager.hookConsole();
		process.stdout.write("blocked\n");
		await manager.withAllowedOutput(() => {
			process.stdout.write("allowed\n");
		});
		process.stdout.write("blocked-again\n");

		expect(writes).toEqual(["allowed\n"]);
	});

	it("withAllowedOutput is a passthrough when verbose or destroyed", async () => {
		const verbose = new ConsoleManager(true);
		await expect(verbose.withAllowedOutput(() => "ok")).resolves.toBe("ok");
		verbose.restore();

		manager.restore();
		await expect(manager.withAllowedOutput(() => "after")).resolves.toBe(
			"after",
		);
	});

	it("restore is idempotent", () => {
		manager.hookConsole();
		manager.restore();
		expect(() => manager.restore()).not.toThrow();
	});

	it("hooks child_process.spawn to pipe noisy MCP process stdio", () => {
		const cp = require("node:child_process") as {
			spawn: (...args: any[]) => unknown;
		};
		const originalSpawn = cp.spawn;
		const spawnSpy = vi.fn().mockReturnValue({ pid: 1 });
		cp.spawn = spawnSpy;

		try {
			manager.hookChildProcessSilence();
			cp.spawn("npx", ["mcp-remote", "server"], { stdio: "inherit" });
			expect(spawnSpy).toHaveBeenCalledWith(
				"npx",
				["mcp-remote", "server"],
				expect.objectContaining({
					stdio: ["pipe", "pipe", "pipe"],
				}),
			);

			spawnSpy.mockClear();
			cp.spawn("node", ["app.js"], { stdio: "inherit" });
			expect(spawnSpy).toHaveBeenCalledWith("node", ["app.js"], {
				stdio: "inherit",
			});
		} finally {
			manager.restore();
			cp.spawn = originalSpawn;
		}
	});

	it("patches spawn when options are the second argument object", () => {
		const cp = require("node:child_process") as {
			spawn: (...args: any[]) => unknown;
		};
		const originalSpawn = cp.spawn;
		const spawnSpy = vi.fn().mockReturnValue({ pid: 1 });
		cp.spawn = spawnSpy;

		try {
			manager.hookChildProcessSilence();
			cp.spawn("mcp-remote", { stdio: "inherit" });
			expect(spawnSpy).toHaveBeenCalledWith(
				"mcp-remote",
				expect.objectContaining({
					stdio: ["pipe", "pipe", "pipe"],
				}),
			);
		} finally {
			manager.restore();
			cp.spawn = originalSpawn;
		}
	});

	it("error and printAnswer write through restored/original writers", () => {
		const out: string[] = [];
		const err: string[] = [];
		process.stdout.write = ((chunk: any) => {
			out.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;
		process.stderr.write = ((chunk: any) => {
			err.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;

		manager.hookConsole();
		manager.error("boom");
		manager.printAnswer("hello **world**");

		expect(err.some((e) => e.includes("boom"))).toBe(true);
		expect(out.join("")).toMatch(/hello/i);
	});

	it("renderMarkdown returns empty string for nullish input", () => {
		expect(manager.renderMarkdown(null as unknown as string)).toBe("");
	});
});
