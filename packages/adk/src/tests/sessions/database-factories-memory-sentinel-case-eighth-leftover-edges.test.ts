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
 * Leftover: `:memory:` is matched via exact `===`, so cased/padded variants
 * do not route to sqlite (unless they also contain `.db`).
 */
describe("database-factories :memory: sentinel case eighth leftover edges", () => {
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

	it("lowercase :memory: still routes to sqlite (control)", () => {
		const Database = mockSqlite();
		createDatabaseSessionService(":memory:");
		expect(Database).toHaveBeenCalledWith(":memory:", undefined);
	});

	it.each([
		":Memory:",
		":MEMORY:",
		":MeMoRy:",
	] as const)("rejects cased memory sentinel %s as unsupported", (url) => {
		expect(() => createDatabaseSessionService(url)).toThrow(
			/Unsupported database URL/,
		);
	});

	it.each([
		":memory: ",
		" :memory:",
		":memory:\n",
	] as const)("rejects padded memory sentinel %j as unsupported", (url) => {
		expect(() => createDatabaseSessionService(url)).toThrow(
			/Unsupported database URL/,
		);
	});

	it("sqlite://:memory: still strips scheme (control)", () => {
		const Database = mockSqlite();
		createDatabaseSessionService("sqlite://:memory:");
		expect(Database).toHaveBeenCalledWith(":memory:", undefined);
	});
});
