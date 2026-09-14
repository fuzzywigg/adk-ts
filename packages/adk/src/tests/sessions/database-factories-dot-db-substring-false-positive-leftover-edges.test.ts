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
 * Leftover: includes(".db") is a substring match — false positives from
 * query params, extensions like .db.bak, and case-sensitive .DB rejection.
 */
describe("database-factories .db substring false-positive leftover edges", () => {
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

	it.each([
		["redis://h?f=a.db", "redis://h?f=a.db"],
		["archive.db.bak", "archive.db.bak"],
		["notadb.dbextra", "notadb.dbextra"],
		["prefix.db/suffix", "prefix.db/suffix"],
		["mem.db:memory-ish", "mem.db:memory-ish"],
		["path/with.db/in/middle", "path/with.db/in/middle"],
		["weird.db?", "weird.db?"],
		["x.db#frag", "x.db#frag"],
	] as const)("false-positive %s routes to sqlite with full string as filename", (url, expected) => {
		const Database = mockSqlite();
		createDatabaseSessionService(url);
		expect(Database).toHaveBeenCalledWith(expected, undefined);
	});

	it.each([
		"archive.DB",
		"path/FILE.DB",
		"x.Db",
		"y.dB",
	] as const)("uppercase/mixed extension %s is unsupported (includes is case-sensitive)", (url) => {
		expect(() => createDatabaseSessionService(url)).toThrow(
			/Unsupported database URL/,
		);
	});

	it("mongodb://host without .db remains unsupported", () => {
		expect(() => createDatabaseSessionService("mongodb://localhost")).toThrow(
			/Unsupported database URL/,
		);
	});

	it("mongodb://host/data.db still false-positives into sqlite", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("mongodb://host/data.db");
		expect(Database).toHaveBeenCalledWith("mongodb://host/data.db", undefined);
	});

	it("bare path ending in .db (legitimate) still works", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("/var/lib/app.db");
		expect(Database).toHaveBeenCalledWith("/var/lib/app.db", undefined);
	});

	it("string that only contains 'db' without dot remains unsupported", () => {
		expect(() => createDatabaseSessionService("mydb")).toThrow(
			/Unsupported database URL/,
		);
		expect(() => createDatabaseSessionService("db")).toThrow(
			/Unsupported database URL/,
		);
	});
});
