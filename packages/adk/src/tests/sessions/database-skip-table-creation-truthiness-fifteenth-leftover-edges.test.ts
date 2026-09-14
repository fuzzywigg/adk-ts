import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Fifteenth leftover: ctor uses `if (!config.skipTableCreation)` — falsy
 * values still initialize tables; truthy non-booleans skip.
 */
describe("database skipTableCreation truthiness fifteenth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function makeDb() {
		const Database = require("better-sqlite3");
		const { Kysely, SqliteDialect } = await import("kysely");
		return new Kysely({
			dialect: new SqliteDialect({
				database: new Database(":memory:"),
			}),
		});
	}

	it.each([
		{ label: "false", value: false, creates: true },
		{ label: "0", value: 0, creates: true },
		{ label: '""', value: "", creates: true },
		{ label: "null", value: null, creates: true },
		{ label: "undefined omitted via falsey", value: undefined, creates: true },
		{ label: "true", value: true, creates: false },
		{ label: '"false"', value: "false", creates: false },
		{ label: "1", value: 1, creates: false },
		{ label: "{}", value: {}, creates: false },
	] as const)("skipTableCreation=$label → creates=$creates", async ({
		value,
		creates,
	}) => {
		const db = await makeDb();
		const spy = vi
			.spyOn(DatabaseSessionService.prototype as any, "initializeDatabase")
			.mockResolvedValue(undefined);
		new DatabaseSessionService({
			db,
			skipTableCreation: value as any,
		});
		if (creates) {
			expect(spy).toHaveBeenCalled();
		} else {
			expect(spy).not.toHaveBeenCalled();
		}
	});
});
