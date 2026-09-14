import { describe, expect, it } from "vitest";
import { createDatabaseSessionService } from "../../sessions/database-factories";

/**
 * Fourteenth leftover: scheme matching uses startsWith without trim —
 * leading whitespace misses postgres/mysql schemes (unless .db trap).
 */
describe("database-factories leading-whitespace scheme miss fourteenth leftover", () => {
	it.each([
		" postgres://localhost/db",
		"  postgresql://localhost/db",
		" mysql://localhost/db",
		"\tpostgres://localhost/db",
	])("leading-whitespace URL %j throws unsupported", (url) => {
		expect(() => createDatabaseSessionService(url)).toThrow(
			/Unsupported database URL/,
		);
	});

	it("leading space with .db substring still routes via includes(.db) trap", () => {
		// includes(".db") is true for ".../app.db" even with leading space
		expect(() => createDatabaseSessionService(" /tmp/app.db")).not.toThrow(
			/Unsupported database URL/,
		);
	});
});
