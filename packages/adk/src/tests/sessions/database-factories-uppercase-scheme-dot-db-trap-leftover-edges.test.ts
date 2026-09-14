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
 * Leftover: uppercase dialect schemes fail startsWith, then `.db` in the path
 * still trips the sqlite trap — postgres/mysql URLs silently become sqlite.
 */
describe("database-factories uppercase scheme + .db trap leftover edges", () => {
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

	it.each([
		"POSTGRES://host/app.db",
		"POSTGRESQL://host/app.db",
		"Postgres://host/sessions.db",
		"MYSQL://host/data.db",
		"MySQL://host/data.db",
		"SQLITE://host/data.db",
	] as const)("%s fails scheme match then misroutes to sqlite via .db", (url) => {
		const Database = mockSqlite();
		createDatabaseSessionService(url);
		expect(Database).toHaveBeenCalledWith(url, undefined);
	});

	it("uppercase POSTGRES without .db is unsupported (no trap)", () => {
		expect(() => createDatabaseSessionService("POSTGRES://host/app")).toThrow(
			/Unsupported database URL/,
		);
	});

	it("uppercase MYSQL without .db is unsupported (no trap)", () => {
		expect(() => createDatabaseSessionService("MYSQL://host/app")).toThrow(
			/Unsupported database URL/,
		);
	});

	it("lowercase postgres://host/app.db does NOT misroute (scheme wins)", () => {
		const Pool = mockPg();
		const Database = vi.fn();
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "pg") {
				return { Pool };
			}
			if (id === "better-sqlite3") {
				return Database;
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		createDatabaseSessionService("postgres://host/app.db");
		expect(Pool).toHaveBeenCalledTimes(1);
		expect(Database).not.toHaveBeenCalled();
	});

	it("forwards options on uppercase+db misroute into sqlite ctor", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("POSTGRES://h/x.db", { timeout: 1 });
		expect(Database).toHaveBeenCalledWith("POSTGRES://h/x.db", { timeout: 1 });
	});
});
