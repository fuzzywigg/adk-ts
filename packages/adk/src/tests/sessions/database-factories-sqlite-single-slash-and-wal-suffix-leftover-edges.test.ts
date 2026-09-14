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
 * Leftover: sqlite:/ (single slash) does not strip scheme; .db-wal/.db-journal
 * substring traps; bare .sqlite unsupported.
 */
describe("database-factories sqlite single-slash and wal-suffix leftover edges", () => {
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
		{
			label: "sqlite:/tmp/x.db single slash",
			url: "sqlite:/tmp/x.db",
			expected: "sqlite:/tmp/x.db",
		},
		{
			label: "sqlite:/absolute.db",
			url: "sqlite:/absolute.db",
			expected: "sqlite:/absolute.db",
		},
		{
			label: "sqlite:relative.db",
			url: "sqlite:relative.db",
			expected: "sqlite:relative.db",
		},
	])("$label keeps full string as filename (no sqlite:// strip)", ({
		url,
		expected,
	}) => {
		const Database = mockSqlite();
		createDatabaseSessionService(url);
		expect(Database).toHaveBeenCalledWith(expected, undefined);
	});

	it.each([
		"foo.db-wal",
		"foo.db-journal",
		"foo.db-shm",
		"archive.db.bak",
		"archive.db.bak-2",
		"path/to/data.db.tmp",
		"prefix.db.suffix.notdb",
	])("substring trap routes %s into sqlite ctor", (url) => {
		const Database = mockSqlite();
		createDatabaseSessionService(url);
		expect(Database).toHaveBeenCalledWith(url, undefined);
	});

	it.each([
		"data.sqlite",
		"data.sqlite3",
		"file:memory",
		"sqlite",
		"SQLITE://x.db",
	])("unsupported without lowercase sqlite:// or .db: %s", (url) => {
		if (url === "SQLITE://x.db") {
			const Database = mockSqlite();
			createDatabaseSessionService(url);
			expect(Database).toHaveBeenCalledWith(url, undefined);
			return;
		}
		expect(() => createDatabaseSessionService(url)).toThrow(
			/Unsupported database URL/,
		);
	});

	it("sqlite:// still strips and wins over wal suffix in path", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("sqlite://./foo.db-wal");
		expect(Database).toHaveBeenCalledWith("./foo.db-wal", undefined);
	});

	it("forwards options on single-slash sqlite: .db trap", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("sqlite:/tmp/x.db", { readonly: true });
		expect(Database).toHaveBeenCalledWith("sqlite:/tmp/x.db", {
			readonly: true,
		});
	});
});
