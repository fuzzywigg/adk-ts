import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Eleventh leftover: reconstructed `isFinalResponse: () => turnComplete === true`
 * — strict boolean true only; truthy non-booleans fail. Companion to
 * boolean-false→null loss leftover (different operator).
 */
describe("database-session turnComplete strict-true eleventh leftover edges", () => {
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

	function convert(turn_complete: unknown) {
		return (service as any).storageEventToEvent({
			id: "e1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date("2020-01-01T00:00:00.000Z"),
			content: null,
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
	}

	it("boolean true → isFinalResponse true", () => {
		const event = convert(true);
		expect(event.turnComplete).toBe(true);
		expect(event.isFinalResponse()).toBe(true);
	});

	it.each([
		{ label: "1", turn_complete: 1 },
		{ label: '"true"', turn_complete: "true" },
		{ label: '"1"', turn_complete: "1" },
		{ label: "{}", turn_complete: {} },
		{ label: "[]", turn_complete: [] },
	])("truthy non-boolean $label is kept on turnComplete but isFinalResponse false", ({
		turn_complete,
	}) => {
		const event = convert(turn_complete);
		// storage uses || undefined — truthy values pass through as-is
		expect(event.turnComplete).toEqual(turn_complete);
		expect(event.isFinalResponse()).toBe(false);
	});

	it.each([
		{ label: "false", turn_complete: false },
		{ label: "0", turn_complete: 0 },
		{ label: '""', turn_complete: "" },
		{ label: "null", turn_complete: null },
	])("falsy $label → turnComplete undefined → isFinalResponse false", ({
		turn_complete,
	}) => {
		const event = convert(turn_complete);
		expect(event.turnComplete).toBeUndefined();
		expect(event.isFinalResponse()).toBe(false);
	});
});
