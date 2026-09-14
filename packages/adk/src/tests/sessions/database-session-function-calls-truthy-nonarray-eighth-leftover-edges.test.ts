import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Leftover: getFunctionCalls/getFunctionResponses use `x || []` — truthy
 * non-arrays pass through; only falsy values coalesce to [].
 */
describe("database-session functionCalls truthy non-array eighth leftover edges", () => {
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

	function row(actions: Record<string, unknown>) {
		return (service as any).storageEventToEvent({
			id: "e1",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: null,
			actions: JSON.stringify(actions),
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
	}

	it.each([
		{ label: "object", value: { name: "x" } },
		{ label: "number 1", value: 1 },
		{ label: "string", value: "calls" },
		{ label: "true", value: true },
	] as const)("getFunctionCalls preserves truthy non-array ($label)", ({
		value,
	}) => {
		const event = row({ functionCalls: value, functionResponses: null });
		expect(event.getFunctionCalls()).toEqual(value);
		expect(Array.isArray(event.getFunctionCalls())).toBe(false);
		expect(event.getFunctionResponses()).toEqual([]);
	});

	it.each([
		{ label: "object", value: { ok: true } },
		{ label: "number 1", value: 1 },
		{ label: "string", value: "resp" },
		{ label: "true", value: true },
	] as const)("getFunctionResponses preserves truthy non-array ($label)", ({
		value,
	}) => {
		const event = row({ functionCalls: null, functionResponses: value });
		expect(event.getFunctionCalls()).toEqual([]);
		expect(event.getFunctionResponses()).toEqual(value);
		expect(Array.isArray(event.getFunctionResponses())).toBe(false);
	});

	it("falsy bags still coalesce to [] (control)", () => {
		const event = row({
			functionCalls: false,
			functionResponses: 0,
		});
		expect(event.getFunctionCalls()).toEqual([]);
		expect(event.getFunctionResponses()).toEqual([]);
	});
});
