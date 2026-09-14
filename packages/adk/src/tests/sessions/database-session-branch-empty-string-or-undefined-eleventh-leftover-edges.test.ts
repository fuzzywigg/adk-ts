import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Eleventh leftover: storageEventToEvent `branch: storageEvent.branch || undefined`
 * — empty string collapses to undefined; author has no such coalesce.
 * Distinct from boolean-false roundtrip leftover.
 */
describe("database-session branch empty-string or-undefined eleventh leftover", () => {
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

	it.each([
		{ label: "empty string", branch: "", expected: undefined },
		{ label: "null", branch: null, expected: undefined },
		{ label: "false", branch: false as any, expected: undefined },
		{ label: "0", branch: 0 as any, expected: undefined },
	])("branch $label → undefined via ||", ({ branch, expected }) => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const event = convert({
			id: "e1",
			invocation_id: "inv",
			author: "agent",
			branch,
			timestamp: new Date("2020-01-01T00:00:00.000Z"),
			content: null,
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
		expect(event.branch).toBe(expected);
	});

	it('keeps whitespace branch " " (truthy asymmetry vs "")', () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const event = convert({
			id: "e1",
			invocation_id: "inv",
			author: "agent",
			branch: " ",
			timestamp: new Date("2020-01-01T00:00:00.000Z"),
			content: null,
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
		expect(event.branch).toBe(" ");
	});

	it("author empty string is kept (no || coalesce on load)", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const event = convert({
			id: "e1",
			invocation_id: "inv",
			author: "",
			branch: "main",
			timestamp: new Date("2020-01-01T00:00:00.000Z"),
			content: null,
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
		expect(event.author).toBe("");
		expect(event.branch).toBe("main");
	});
});
