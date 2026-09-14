import Module from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabaseSessionService } from "../../sessions/database-factories";

vi.mock("../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

/**
 * Leftover: scheme matching uses case-sensitive startsWith — uppercase schemes
 * fall through instead of routing to the matching dialect factory.
 */
describe("database-factories scheme case-sensitivity leftover edges", () => {
	const originalRequire = Module.prototype.require;

	afterEach(() => {
		Module.prototype.require = originalRequire;
	});

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

	it.each([
		"POSTGRES://localhost/db",
		"POSTGRESQL://localhost/db",
		"Postgres://localhost/db",
		"PostgreSQL://localhost/db",
	] as const)("rejects uppercase/mixed postgres scheme %s as unsupported", (url) => {
		expect(() => createDatabaseSessionService(url)).toThrow(
			/Unsupported database URL/,
		);
	});

	it.each([
		"MYSQL://localhost/db",
		"Mysql://localhost/db",
		"MySQL://localhost/db",
	] as const)("rejects uppercase/mixed mysql scheme %s as unsupported", (url) => {
		expect(() => createDatabaseSessionService(url)).toThrow(
			/Unsupported database URL/,
		);
	});

	it.each([
		"SQLITE://:memory:",
		"Sqlite://:memory:",
		"SQLite://relative.db",
	] as const)("rejects uppercase/mixed sqlite scheme %s as unsupported (no .db substring)", (url) => {
		if (url.includes(".db")) {
			const Database = mockSqlite();
			createDatabaseSessionService(url);
			expect(Database).toHaveBeenCalledWith(url, undefined);
			return;
		}
		expect(() => createDatabaseSessionService(url)).toThrow(
			/Unsupported database URL/,
		);
	});

	it("lowercase postgres:// still routes to Pool (control)", () => {
		const Pool = mockPg();
		createDatabaseSessionService("postgres://localhost/db");
		expect(Pool).toHaveBeenCalledTimes(1);
	});

	it("lowercase mysql:// still routes to createPool (control)", () => {
		const createPool = mockMysql();
		createDatabaseSessionService("mysql://localhost/db");
		expect(createPool).toHaveBeenCalledTimes(1);
	});

	it("lowercase sqlite:// still strips prefix (control)", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("sqlite://case-control.db");
		expect(Database).toHaveBeenCalledWith("case-control.db", undefined);
	});

	it("mixed PostgresSQL typo remains unsupported", () => {
		expect(() =>
			createDatabaseSessionService("PostgresSQL://localhost/db"),
		).toThrow(/Unsupported database URL/);
	});
});
