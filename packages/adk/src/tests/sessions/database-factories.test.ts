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

	function stubPeer(packageName: string, exports: unknown): void {
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === packageName) {
				return exports;
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;
	}

	it("constructs a postgres session service when pg is available", () => {
		const Pool = vi.fn(function MockPool(this: any, opts: any) {
			this.options = opts;
			this.on = vi.fn();
			this.end = vi.fn();
			this.connect = vi.fn();
			this.query = vi.fn();
		});
		stubPeer("pg", { Pool });

		const service = createPostgresSessionService(
			"postgres://localhost:5432/adk",
			{ max: 4 },
		);
		expect(service).toBeDefined();
		expect(typeof service.createSession).toBe("function");
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgres://localhost:5432/adk",
			max: 4,
		});
	});

	it("routes postgresql URLs through createDatabaseSessionService when pg is available", () => {
		const Pool = vi.fn(function MockPool(this: any) {
			this.on = vi.fn();
			this.end = vi.fn();
			this.connect = vi.fn();
			this.query = vi.fn();
		});
		stubPeer("pg", { Pool });

		const viaPostgres = createDatabaseSessionService(
			"postgres://user:pass@localhost/db",
			{ idleTimeoutMillis: 1000 },
		);
		const viaPostgresql = createDatabaseSessionService(
			"postgresql://localhost/db",
		);
		expect(viaPostgres).toBeDefined();
		expect(viaPostgresql).toBeDefined();
		expect(Pool).toHaveBeenCalled();
	});

	it("constructs a mysql session service when mysql2 is available", () => {
		const createPool = vi.fn((opts: any) => ({
			options: opts,
			on: vi.fn(),
			end: vi.fn(),
			query: vi.fn(),
			getConnection: vi.fn(),
		}));
		stubPeer("mysql2", { createPool });

		const service = createMysqlSessionService("mysql://localhost/adk", {
			connectionLimit: 2,
		});
		expect(service).toBeDefined();
		expect(typeof service.createSession).toBe("function");
		expect(createPool).toHaveBeenCalledWith({
			uri: "mysql://localhost/adk",
			connectionLimit: 2,
		});
	});

	it("routes mysql:// URLs through createDatabaseSessionService when mysql2 is available", () => {
		const createPool = vi.fn(() => ({
			on: vi.fn(),
			end: vi.fn(),
			query: vi.fn(),
			getConnection: vi.fn(),
		}));
		stubPeer("mysql2", { createPool });

		const service = createDatabaseSessionService("mysql://localhost/adk");
		expect(service).toBeDefined();
		expect(createPool).toHaveBeenCalled();
	});

	it("forwards sqlite options and .db path routing", () => {
		const withOptions = createSqliteSessionService(":memory:", {
			readonly: false,
		});
		expect(withOptions).toBeDefined();
		expect(typeof withOptions.createSession).toBe("function");

		const fromDbPath = createDatabaseSessionService("/tmp/adk-test-session.db");
		expect(fromDbPath).toBeDefined();
		expect(typeof fromDbPath.getSession).toBe("function");

		const stripped = createDatabaseSessionService(
			"sqlite:///tmp/adk-stripped.db",
		);
		expect(stripped).toBeDefined();
	});
});
