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

/**
 * Leftover: options forwarding through auto-detect traps and direct factories,
 * including undefined vs {} vs sparse option bags on misrouted URLs.
 */
describe("database-factories url-trap options-forward leftover edges", () => {
	const originalRequire = Module.prototype.require;

	afterEach(() => {
		Module.prototype.require = originalRequire;
	});

	function mockSqlite(): ReturnType<typeof vi.fn> {
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
		return Database;
	}

	function mockPg(): ReturnType<typeof vi.fn> {
		const Pool = vi.fn().mockImplementation(() => ({
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
		return Pool;
	}

	function mockMysql(): ReturnType<typeof vi.fn> {
		const createPool = vi.fn(() => ({ end: vi.fn() }));
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
		return createPool;
	}

	it("auto-detect http://x.db forwards undefined options as second ctor arg", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("http://x.db");
		expect(Database).toHaveBeenCalledWith("http://x.db", undefined);
	});

	it("auto-detect http://x.db forwards empty options object", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("http://x.db", {});
		expect(Database).toHaveBeenCalledWith("http://x.db", {});
	});

	it("auto-detect archive.db.bak forwards sparse options", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("archive.db.bak", {
			readonly: true,
			fileMustExist: true,
		});
		expect(Database).toHaveBeenCalledWith("archive.db.bak", {
			readonly: true,
			fileMustExist: true,
		});
	});

	it("auto-detect postgresql:// forwards options into Pool", () => {
		const Pool = mockPg();
		createDatabaseSessionService("postgresql://h/db", {
			ssl: false,
			max: 2,
		});
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgresql://h/db",
			ssl: false,
			max: 2,
		});
	});

	it("auto-detect mysql:// forwards options into createPool", () => {
		const createPool = mockMysql();
		createDatabaseSessionService("mysql://h/db", { connectionLimit: 4 });
		expect(createPool).toHaveBeenCalledWith({
			uri: "mysql://h/db",
			connectionLimit: 4,
		});
	});

	it("direct createSqliteSessionService spreads undefined options", () => {
		const Database = mockSqlite();
		createSqliteSessionService("direct.db");
		expect(Database).toHaveBeenCalledWith("direct.db", undefined);
	});

	it("direct createPostgresSessionService with undefined options", () => {
		const Pool = mockPg();
		createPostgresSessionService("postgresql://h/db");
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgresql://h/db",
		});
	});

	it("direct createMysqlSessionService with undefined options", () => {
		const createPool = mockMysql();
		createMysqlSessionService("mysql://h/db");
		expect(createPool).toHaveBeenCalledWith({
			uri: "mysql://h/db",
		});
	});

	it("auto-detect :memory: forwards options", () => {
		const Database = mockSqlite();
		createDatabaseSessionService(":memory:", { timeout: 5000 });
		expect(Database).toHaveBeenCalledWith(":memory:", { timeout: 5000 });
	});

	it("peer miss still wraps non-Error throws from require", () => {
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "better-sqlite3") {
				throw "string-fail";
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		expect(() => createSqliteSessionService(":memory:")).toThrow(
			/Missing required peer dependency: better-sqlite3/,
		);
	});

	it("peer miss wraps non-Error for pg", () => {
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "pg") {
				throw 42;
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		expect(() => createPostgresSessionService("postgresql://x")).toThrow(
			/Missing required peer dependency: pg/,
		);
	});

	it("peer miss wraps non-Error for mysql2", () => {
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "mysql2") {
				throw { code: "MODULE_NOT_FOUND" };
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		expect(() => createMysqlSessionService("mysql://x")).toThrow(
			/Missing required peer dependency: mysql2/,
		);
	});
});
