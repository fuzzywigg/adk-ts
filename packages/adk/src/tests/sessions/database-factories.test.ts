import Module from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

	it("surfaces missing better-sqlite3 peer dependency", () => {
		blockPeer("better-sqlite3");
		expect(() => createSqliteSessionService(":memory:")).toThrow(
			/Missing required peer dependency: better-sqlite3/,
		);
		expect(() => createSqliteSessionService(":memory:")).toThrow(
			/To use SQLite sessions/,
		);
	});

	it("routes bare .db filenames through the sqlite factory", async () => {
		const dir = await mkdtemp(join(tmpdir(), "adk-sessions-"));
		const dbPath = join(dir, "file-sessions.db");
		try {
			const service = createDatabaseSessionService(dbPath);
			expect(service).toBeDefined();
			expect(typeof service.createSession).toBe("function");
			const session = await service.createSession("app", "u", {}, "s1");
			expect(session.id).toBe("s1");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("passes options through to the postgres Pool when pg is present", () => {
		const Pool = vi.fn().mockImplementation(() => ({
			on: vi.fn(),
			end: vi.fn(),
			connect: vi.fn(),
		}));
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
			max: 7,
			idleTimeoutMillis: 1000,
		});
		expect(service).toBeDefined();
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgres://localhost/db",
			max: 7,
			idleTimeoutMillis: 1000,
		});
	});

	it("passes options through to mysql2 createPool when present", () => {
		const createPool = vi.fn().mockReturnValue({
			end: vi.fn(),
			query: vi.fn(),
		});
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
			connectionLimit: 4,
		});
		expect(service).toBeDefined();
		expect(createPool).toHaveBeenCalledWith({
			uri: "mysql://localhost/db",
			connectionLimit: 4,
		});
	});

	it("passes sqlite options into better-sqlite3 constructor", () => {
		const Database = vi.fn().mockImplementation(() => ({
			close: vi.fn(),
			prepare: vi.fn(),
		}));
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

		const service = createSqliteSessionService("custom.db", { readonly: true });
		expect(service).toBeDefined();
		expect(Database).toHaveBeenCalledWith("custom.db", { readonly: true });
	});

	it("createDatabaseSessionService forwards options to postgres routes", () => {
		const Pool = vi.fn().mockImplementation(() => ({
			on: vi.fn(),
			end: vi.fn(),
			connect: vi.fn(),
		}));
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

		createDatabaseSessionService("postgresql://localhost/db", { max: 3 });
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgresql://localhost/db",
			max: 3,
		});
	});
});
