import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Fifteenth leftover: error_code / error_message use `|| null` on write and
 * `|| undefined` on read — string "0" survives roundtrip; "" becomes null/undefined.
 */
describe("database error-code string-zero keep fifteenth leftover", () => {
	let service: DatabaseSessionService;

	beforeEach(async () => {
		const Database = require("better-sqlite3");
		const { Kysely, SqliteDialect } = await import("kysely");
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: new Database(":memory:"),
			}),
		});
		service = new DatabaseSessionService({ db });
	});

	function toStorage(event: Record<string, unknown>) {
		return (service as any).eventToStorageEvent(
			{
				id: "s1",
				appName: "app",
				userId: "u",
				state: {},
				events: [],
				lastUpdateTime: 0,
			},
			{
				id: "e1",
				author: "agent",
				invocationId: "inv",
				timestamp: 1,
				...event,
			},
		);
	}

	it('errorCode/Message "0" roundtrip through storage', () => {
		const stored = toStorage({ errorCode: "0", errorMessage: "0" });
		expect(stored.error_code).toBe("0");
		expect(stored.error_message).toBe("0");

		const event = (service as any).storageEventToEvent({
			...stored,
			timestamp: new Date("2024-01-01T00:00:00.000Z"),
		});
		expect(event.errorCode).toBe("0");
		expect(event.errorMessage).toBe("0");
	});

	it("empty string error fields become null/undefined (control)", () => {
		const stored = toStorage({ errorCode: "", errorMessage: "" });
		expect(stored.error_code).toBeNull();
		expect(stored.error_message).toBeNull();

		const event = (service as any).storageEventToEvent({
			...stored,
			timestamp: new Date("2024-01-01T00:00:00.000Z"),
		});
		expect(event.errorCode).toBeUndefined();
		expect(event.errorMessage).toBeUndefined();
	});
});
