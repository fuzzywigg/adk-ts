import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../../sessions/database-session-service";
import { State } from "../../../sessions/state";

describe("DatabaseSessionService leftover: eventToStorageEvent coalesce", () => {
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

	function session() {
		return {
			id: "s1",
			appName: "app",
			userId: "user",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
	}

	it("coalesces falsy scalar fields to empty string or null", () => {
		const toStorage = (service as any).eventToStorageEvent.bind(service);
		const falsyScalars = [undefined, null, "", 0, false] as const;

		for (const falsy of falsyScalars) {
			const row = toStorage(session(), {
				id: "e1",
				invocationId: falsy,
				author: falsy,
				branch: falsy,
				content: falsy,
				actions: falsy,
				longRunningToolIds: falsy,
				groundingMetadata: falsy,
				partial: falsy,
				turnComplete: falsy,
				errorCode: falsy,
				errorMessage: falsy,
				interrupted: falsy,
			});
			expect(row.invocation_id).toBe("");
			expect(row.author).toBe("");
			expect(row.branch).toBeNull();
			expect(row.content).toBeNull();
			expect(row.actions).toBeNull();
			expect(row.long_running_tool_ids_json).toBeNull();
			expect(row.grounding_metadata).toBeNull();
			expect(row.partial).toBeNull();
			expect(row.turn_complete).toBeNull();
			expect(row.error_code).toBeNull();
			expect(row.error_message).toBeNull();
			expect(row.interrupted).toBeNull();
		}
	});

	it("serializes truthy content/actions/ids/metadata", () => {
		const toStorage = (service as any).eventToStorageEvent.bind(service);
		const row = toStorage(session(), {
			id: "e2",
			invocationId: "inv",
			author: "agent",
			branch: "main",
			content: { role: "model", parts: [{ text: "hi" }] },
			actions: { stateDelta: { a: 1 } },
			longRunningToolIds: new Set(["t1", "t2"]),
			groundingMetadata: { sources: [1] },
			partial: true,
			turnComplete: true,
			errorCode: "E",
			errorMessage: "oops",
			interrupted: true,
		});
		expect(row.invocation_id).toBe("inv");
		expect(row.author).toBe("agent");
		expect(row.branch).toBe("main");
		expect(JSON.parse(row.content)).toEqual({
			role: "model",
			parts: [{ text: "hi" }],
		});
		expect(JSON.parse(row.actions)).toEqual({ stateDelta: { a: 1 } });
		expect(new Set(JSON.parse(row.long_running_tool_ids_json))).toEqual(
			new Set(["t1", "t2"]),
		);
		expect(JSON.parse(row.grounding_metadata)).toEqual({ sources: [1] });
		expect(row.partial).toBe(true);
		expect(row.turn_complete).toBe(true);
		expect(row.error_code).toBe("E");
		expect(row.error_message).toBe("oops");
		expect(row.interrupted).toBe(true);
	});
});

describe("DatabaseSessionService leftover: storageEventToEvent coalesce", () => {
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

	it("maps null branch/partials to undefined and keeps truthy flags", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const withNulls = convert({
			id: "e1",
			invocation_id: "inv",
			author: "agent",
			timestamp: new Date("2024-01-01T00:00:00.000Z"),
			content: null,
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
			branch: null,
		});
		expect(withNulls.branch).toBeUndefined();
		expect(withNulls.content).toBeUndefined();
		expect(withNulls.actions).toBeUndefined();
		expect(withNulls.longRunningToolIds).toBeUndefined();
		expect(withNulls.groundingMetadata).toBeUndefined();
		expect(withNulls.partial).toBeUndefined();
		expect(withNulls.turnComplete).toBeUndefined();
		expect(withNulls.errorCode).toBeUndefined();
		expect(withNulls.errorMessage).toBeUndefined();
		expect(withNulls.interrupted).toBeUndefined();

		const withFlags = convert({
			id: "e2",
			invocation_id: "inv2",
			author: "user",
			timestamp: new Date("2024-06-01T00:00:00.000Z"),
			content: JSON.stringify({ role: "user", parts: [{ text: "q" }] }),
			actions: JSON.stringify({ stateDelta: {} }),
			long_running_tool_ids_json: JSON.stringify(["a"]),
			grounding_metadata: JSON.stringify({ g: true }),
			partial: false,
			turn_complete: true,
			error_code: "X",
			error_message: "msg",
			interrupted: false,
			branch: "b1",
		});
		expect(withFlags.branch).toBe("b1");
		expect(withFlags.partial).toBeUndefined();
		expect(withFlags.turnComplete).toBe(true);
		expect(withFlags.errorCode).toBe("X");
		expect(withFlags.errorMessage).toBe("msg");
		expect(withFlags.interrupted).toBeUndefined();
		expect(withFlags.isFinalResponse()).toBe(true);
		expect(withFlags.longRunningToolIds).toEqual(new Set(["a"]));
	});

	it("getFunctionCalls coalesces missing/null functionCalls to []", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const cases: Array<{ label: string; actions: unknown; expected: unknown }> =
			[
				{ label: "no actions", actions: null, expected: [] },
				{
					label: "actions without functionCalls",
					actions: { x: 1 },
					expected: [],
				},
				{
					label: "null functionCalls",
					actions: { functionCalls: null },
					expected: [],
				},
				{
					label: "false functionCalls",
					actions: { functionCalls: false },
					expected: [],
				},
				{
					label: "populated functionCalls",
					actions: { functionCalls: [{ name: "t" }] },
					expected: [{ name: "t" }],
				},
			];

		for (const row of cases) {
			const event = convert({
				id: "e",
				invocation_id: "i",
				author: "a",
				timestamp: new Date(),
				content: null,
				actions: row.actions ? JSON.stringify(row.actions) : null,
				long_running_tool_ids_json: null,
				grounding_metadata: null,
				partial: null,
				turn_complete: null,
				error_code: null,
				error_message: null,
				interrupted: null,
				branch: null,
			});
			expect(event.getFunctionCalls()).toEqual(row.expected);
		}
	});

	it("getFunctionResponses coalesces missing/null functionResponses to []", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const cases = [
			{ actions: null, expected: [] },
			{ actions: {}, expected: [] },
			{ actions: { functionResponses: null }, expected: [] },
			{ actions: { functionResponses: false }, expected: [] },
			{
				actions: { functionResponses: [{ name: "r" }] },
				expected: [{ name: "r" }],
			},
		];
		for (const row of cases) {
			const event = convert({
				id: "e",
				invocation_id: "i",
				author: "a",
				timestamp: new Date(),
				content: null,
				actions: row.actions ? JSON.stringify(row.actions) : null,
				long_running_tool_ids_json: null,
				grounding_metadata: null,
				partial: null,
				turn_complete: null,
				error_code: null,
				error_message: null,
				interrupted: null,
				branch: null,
			});
			expect(event.getFunctionResponses()).toEqual(row.expected);
		}
	});

	it("hasTrailingCodeExecutionResult coalesces falsy to false", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const cases: Array<{ value: unknown; expected: boolean }> = [
			{ value: undefined, expected: false },
			{ value: null, expected: false },
			{ value: false, expected: false },
			{ value: 0, expected: false },
			{ value: "", expected: false },
			{ value: true, expected: true },
			{ value: 1, expected: true },
		];
		for (const row of cases) {
			const actions =
				row.value === undefined
					? {}
					: { hasTrailingCodeExecutionResult: row.value };
			const event = convert({
				id: "e",
				invocation_id: "i",
				author: "a",
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
				branch: null,
			});
			expect(event.hasTrailingCodeExecutionResult()).toBe(row.expected);
		}
		const noActions = convert({
			id: "e",
			invocation_id: "i",
			author: "a",
			timestamp: new Date(),
			content: null,
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
			branch: null,
		});
		expect(noActions.hasTrailingCodeExecutionResult()).toBe(false);
	});
});

describe("DatabaseSessionService leftover: updateSessionState + createSession id", () => {
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

	it("updateSessionState skips TEMP keys and no-ops without stateDelta", () => {
		const update = (service as any).updateSessionState.bind(service);
		const session = {
			id: "s",
			appName: "app",
			userId: "u",
			state: { keep: 1 },
			events: [],
			lastUpdateTime: 0,
		};
		update(session, { actions: undefined });
		expect(session.state).toEqual({ keep: 1 });
		update(session, { actions: {} });
		expect(session.state).toEqual({ keep: 1 });
		update(session, {
			actions: {
				stateDelta: {
					[`${State.TEMP_PREFIX}scratch`]: "tmp",
					local: "x",
					[`${State.APP_PREFIX}flag`]: true,
				},
			},
		});
		expect(session.state).toEqual({
			keep: 1,
			local: "x",
			[`${State.APP_PREFIX}flag`]: true,
		});
		expect(session.state[`${State.TEMP_PREFIX}scratch`]).toBeUndefined();
	});

	it("createSession trims id and regenerates whitespace-only", async () => {
		const trimmed = await service.createSession(
			"app",
			"user",
			{ a: 1 },
			"  keep  ",
		);
		expect(trimmed.id).toBe("keep");
		expect(trimmed.state.a).toBe(1);

		for (const blank of ["", "   ", "\t\n"]) {
			const generated = await service.createSession("app", "user", {}, blank);
			expect(generated.id).toMatch(/^session-/);
		}
	});

	it("appendEvent round-trips falsy branch/error fields via storage coalesce", async () => {
		const session = await service.createSession("app", "user", {}, "roundtrip");
		await service.appendEvent(session, {
			id: "e1",
			author: "agent",
			invocationId: "inv",
			timestamp: 1_700_000_000,
			content: { role: "model", parts: [{ text: "hi" }] },
			actions: {
				functionCalls: [{ name: "t" }],
				functionResponses: [{ name: "t", response: { ok: true } }],
				hasTrailingCodeExecutionResult: false,
				stateDelta: { local: 1 },
			},
		} as any);
		const fetched = await service.getSession("app", "user", "roundtrip");
		expect(fetched?.events).toHaveLength(1);
		const event = fetched!.events[0];
		expect(event.content).toEqual({
			role: "model",
			parts: [{ text: "hi" }],
		});
		expect(event.getFunctionCalls()).toEqual([{ name: "t" }]);
		expect(event.getFunctionResponses()).toEqual([
			{ name: "t", response: { ok: true } },
		]);
		expect(event.hasTrailingCodeExecutionResult()).toBe(false);
		expect(fetched?.state.local).toBe(1);
	});
});
