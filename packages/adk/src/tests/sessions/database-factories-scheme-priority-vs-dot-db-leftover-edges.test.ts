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
 * Leftover: scheme-priority matrix — lowercase dialect schemes win over `.db`
 * in the path; without a matching scheme the `.db` trap applies.
 */
describe("database-factories scheme-priority vs .db leftover edges", () => {
	const originalRequire = Module.prototype.require;

	afterEach(() => {
		Module.prototype.require = originalRequire;
	});

	function installMocks(opts: {
		Pool?: ReturnType<typeof vi.fn>;
		createPool?: ReturnType<typeof vi.fn>;
		Database?: ReturnType<typeof vi.fn>;
	}) {
		const Pool =
			opts.Pool ??
			vi.fn().mockImplementation(() => ({ end: vi.fn(), connect: vi.fn() }));
		const createPool = opts.createPool ?? vi.fn(() => ({ end: vi.fn() }));
		const Database =
			opts.Database ??
			vi.fn().mockImplementation(() => ({
				close: vi.fn(),
				prepare: vi.fn(),
			}));
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "pg") {
				return { Pool };
			}
			if (id === "mysql2") {
				return { createPool };
			}
			if (id === "better-sqlite3") {
				return Database;
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;
		return { Pool, createPool, Database };
	}

	it.each([
		["postgres://h/x.db", "pg"],
		["postgresql://h/x.db", "pg"],
		["mysql://h/x.db", "mysql"],
		["sqlite://h/x.db", "sqlite-stripped"],
	] as const)("%s routes by scheme, not .db trap (%s)", (url, kind) => {
		const { Pool, createPool, Database } = installMocks({});
		createDatabaseSessionService(url);
		if (kind === "pg") {
			expect(Pool).toHaveBeenCalledTimes(1);
			expect(Database).not.toHaveBeenCalled();
			expect(createPool).not.toHaveBeenCalled();
		} else if (kind === "mysql") {
			expect(createPool).toHaveBeenCalledTimes(1);
			expect(Pool).not.toHaveBeenCalled();
			expect(Database).not.toHaveBeenCalled();
		} else {
			expect(Database).toHaveBeenCalledWith("h/x.db", undefined);
			expect(Pool).not.toHaveBeenCalled();
			expect(createPool).not.toHaveBeenCalled();
		}
	});

	it.each([
		"cassandra://h/x.db",
		"cockroach://h/x.db",
		"mssql://h/x.db",
		"oracle://h/x.db",
	] as const)("%s has no scheme match → sqlite trap", (url) => {
		const { Database, Pool, createPool } = installMocks({});
		createDatabaseSessionService(url);
		expect(Database).toHaveBeenCalledWith(url, undefined);
		expect(Pool).not.toHaveBeenCalled();
		expect(createPool).not.toHaveBeenCalled();
	});

	it.each([
		"cassandra://h/x",
		"cockroach://h/x",
		"mssql://h/x",
		"oracle://h/x",
	] as const)("%s without .db remains unsupported", (url) => {
		expect(() => createDatabaseSessionService(url)).toThrow(
			/Unsupported database URL/,
		);
	});

	it("postgres check order: postgres:// before postgresql:// both work", () => {
		const { Pool } = installMocks({});
		createDatabaseSessionService("postgres://a/b");
		createDatabaseSessionService("postgresql://a/b");
		expect(Pool).toHaveBeenCalledTimes(2);
	});
});
