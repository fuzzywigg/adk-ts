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
 * Leftover: sqlite:// prefix strip via substring(9) — empty / slash-only /
 * odd residual filenames after the scheme.
 */
describe("database-factories sqlite empty prefix-strip leftover edges", () => {
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

	it('sqlite:// alone strips to empty filename ""', () => {
		const Database = mockSqlite();
		createDatabaseSessionService("sqlite://");
		expect(Database).toHaveBeenCalledWith("", undefined);
	});

	it("sqlite:/// strips to a single leading slash", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("sqlite:///");
		expect(Database).toHaveBeenCalledWith("/", undefined);
	});

	it("sqlite://// strips to //", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("sqlite:////");
		expect(Database).toHaveBeenCalledWith("//", undefined);
	});

	it("sqlite://:memory: strips to :memory:", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("sqlite://:memory:");
		expect(Database).toHaveBeenCalledWith(":memory:", undefined);
	});

	it("sqlite://./relative.db strips to ./relative.db", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("sqlite://./relative.db");
		expect(Database).toHaveBeenCalledWith("./relative.db", undefined);
	});

	it("sqlite:// with options forwards options after strip", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("sqlite://", { verbose: null });
		expect(Database).toHaveBeenCalledWith("", { verbose: null });
	});

	it(":memory: without scheme does not strip anything", () => {
		const Database = mockSqlite();
		createDatabaseSessionService(":memory:");
		expect(Database).toHaveBeenCalledWith(":memory:", undefined);
	});

	it("sqlite://host/path.db strips only the scheme (host/path remains)", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("sqlite://host/path.db");
		expect(Database).toHaveBeenCalledWith("host/path.db", undefined);
	});

	it("bare empty string remains unsupported (no sqlite://, no .db)", () => {
		expect(() => createDatabaseSessionService("")).toThrow(
			/Unsupported database URL/,
		);
	});
});
