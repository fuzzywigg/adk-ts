import Module from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createDatabaseSessionService,
	createMysqlSessionService,
	createPostgresSessionService,
	createSqliteSessionService,
} from "../../sessions/database-factories";

vi.mock("../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

describe("database-factories", () => {
	const originalRequire = Module.prototype.require;

	afterEach(() => {
		Module.prototype.require = originalRequire;
	});

	function blockPeer(packageName: string): void {
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === packageName) {
				throw new Error(`Cannot find module '${packageName}'`);
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;
	}

	it("rejects unsupported database URLs", () => {
		expect(() => createDatabaseSessionService("redis://localhost")).toThrow(
			"Unsupported database URL",
		);
	});

	it("routes sqlite:// and :memory: to the sqlite factory", () => {
		const memory = createDatabaseSessionService(":memory:");
		expect(memory).toBeDefined();
		expect(typeof memory.createSession).toBe("function");

		const fromUri = createDatabaseSessionService("sqlite://:memory:");
		expect(fromUri).toBeDefined();
	});

	it("strips the sqlite:// prefix when creating the filename", () => {
		const service = createDatabaseSessionService("sqlite://:memory:");
		expect(service).toBeDefined();
		expect(typeof service.createSession).toBe("function");
	});

	it("creates a sqlite session service for .db paths", () => {
		const service = createSqliteSessionService(":memory:");
		expect(service).toBeDefined();
		expect(typeof service.getSession).toBe("function");
	});

	it("routes postgres:// and postgresql:// URLs to the postgres factory", () => {
		blockPeer("pg");
		expect(() =>
			createDatabaseSessionService("postgres://localhost/db"),
		).toThrow(/Missing required peer dependency: pg/);
		expect(() =>
			createDatabaseSessionService("postgresql://localhost/db"),
		).toThrow(/Missing required peer dependency: pg/);
		expect(() =>
			createPostgresSessionService("postgres://localhost/db"),
		).toThrow(/pnpm add pg/);
	});

	it("routes mysql:// URLs to the mysql factory", () => {
		blockPeer("mysql2");
		expect(() => createDatabaseSessionService("mysql://localhost/db")).toThrow(
			/Missing required peer dependency: mysql2/,
		);
		expect(() => createMysqlSessionService("mysql://localhost/db")).toThrow(
			/To use MySQL sessions/,
		);
	});

	it("throws an install hint when better-sqlite3 is missing", () => {
		blockPeer("better-sqlite3");
		expect(() => createSqliteSessionService(":memory:")).toThrow(
			/Missing required peer dependency: better-sqlite3/,
		);
		expect(() => createSqliteSessionService(":memory:")).toThrow(
			/pnpm add better-sqlite3/,
		);
	});

	it("createPostgresSessionService constructs a service when pg is available", () => {
		const Pool = vi.fn(function Pool(this: { opts: unknown }, opts: unknown) {
			this.opts = opts;
		});
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "pg") {
				return { Pool };
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		const service = createPostgresSessionService("postgres://localhost/db", {
			max: 3,
		});
		expect(service).toBeDefined();
		expect(typeof service.createSession).toBe("function");
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgres://localhost/db",
			max: 3,
		});

		const viaUrl = createDatabaseSessionService(
			"postgresql://localhost/other",
			{ ssl: false },
		);
		expect(viaUrl).toBeDefined();
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgresql://localhost/other",
			ssl: false,
		});
	});

	it("createMysqlSessionService constructs a service when mysql2 is available", () => {
		const createPool = vi.fn((opts: unknown) => ({ opts }));
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "mysql2") {
				return { createPool };
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		const service = createMysqlSessionService("mysql://localhost/db", {
			connectionLimit: 5,
		});
		expect(service).toBeDefined();
		expect(typeof service.getSession).toBe("function");
		expect(createPool).toHaveBeenCalledWith({
			uri: "mysql://localhost/db",
			connectionLimit: 5,
		});

		const viaUrl = createDatabaseSessionService("mysql://localhost/app");
		expect(viaUrl).toBeDefined();
		expect(createPool).toHaveBeenCalledWith({
			uri: "mysql://localhost/app",
		});
	});

	it("auto-detects .db paths and strips sqlite:/// prefixes", async () => {
		const fs = await import("node:fs");
		const path = await import("node:path");
		const os = await import("node:os");
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adk-sess-"));
		const dbPath = path.join(tmpDir, "auto-detect.db");

		try {
			const fromExt = createDatabaseSessionService(dbPath);
			expect(fromExt).toBeDefined();
			expect(typeof fromExt.createSession).toBe("function");

			const fromUri = createDatabaseSessionService(`sqlite://${dbPath}`);
			expect(fromUri).toBeDefined();
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("forwards sqlite options into better-sqlite3", () => {
		const Database = vi.fn(function Database(
			this: { filename: string; options: unknown },
			filename: string,
			options: unknown,
		) {
			this.filename = filename;
			this.options = options;
			return {
				prepare: () => ({
					run: () => undefined,
					all: () => [],
					get: () => undefined,
				}),
				exec: () => undefined,
				pragma: () => undefined,
				close: () => undefined,
			};
		});
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "better-sqlite3") {
				return Database;
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		const service = createSqliteSessionService(":memory:", { readonly: true });
		expect(service).toBeDefined();
		expect(Database).toHaveBeenCalledWith(":memory:", { readonly: true });
	});
});
