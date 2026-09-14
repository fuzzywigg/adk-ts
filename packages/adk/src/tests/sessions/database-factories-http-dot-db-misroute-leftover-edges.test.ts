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
 * Leftover: `includes(".db")` after scheme checks misroutes non-sqlite URLs
 * that merely contain `.db` (e.g. http://host/path.db) into SQLite.
 */
describe("database-factories http/.db misroute leftover edges", () => {
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
		return Pool;
	}

	it.each([
		["http://example.com/data.db", "http://example.com/data.db"],
		[
			"https://cdn.example.com/sessions.db",
			"https://cdn.example.com/sessions.db",
		],
		["ftp://files.example.com/backup.db", "ftp://files.example.com/backup.db"],
		["redis://host/foo.db", "redis://host/foo.db"],
		["file:///tmp/sessions.db", "file:///tmp/sessions.db"],
		["s3://bucket/path/store.db", "s3://bucket/path/store.db"],
	] as const)("misroutes %s into sqlite via includes('.db')", (url, expectedFilename) => {
		const Database = mockSqlite();
		createDatabaseSessionService(url);
		expect(Database).toHaveBeenCalledWith(expectedFilename, undefined);
	});

	it("http://localhost without .db remains unsupported", () => {
		expect(() => createDatabaseSessionService("http://localhost")).toThrow(
			/Unsupported database URL/,
		);
	});

	it("http://host/data.db still misroutes even when options are forwarded", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("http://host/data.db", { readonly: true });
		expect(Database).toHaveBeenCalledWith("http://host/data.db", {
			readonly: true,
		});
	});

	it("lowercase postgres://host/file.db prefers postgres scheme over .db trap", () => {
		const Pool = mockPg();
		createDatabaseSessionService("postgres://host/file.db", { max: 3 });
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgres://host/file.db",
			max: 3,
		});
	});

	it("lowercase postgresql://host/archive.db prefers postgres over .db trap", () => {
		const Pool = mockPg();
		createDatabaseSessionService("postgresql://host/archive.db");
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgresql://host/archive.db",
		});
	});

	it("query-string .db on non-scheme URL still triggers sqlite", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("custom://svc?path=a.db");
		expect(Database).toHaveBeenCalledWith("custom://svc?path=a.db", undefined);
	});
});
