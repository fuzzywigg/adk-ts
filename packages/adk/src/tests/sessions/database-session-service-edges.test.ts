import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

describe("DatabaseSessionService leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function makeService() {
		const Database = require("better-sqlite3");
		const { Kysely, SqliteDialect } = await import("kysely");
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: new Database(":memory:"),
			}),
		});
		return new DatabaseSessionService({ db });
	}

	it("generates a session id when sessionId is whitespace-only", async () => {
		const service = await makeService();
		const created = await service.createSession("app", "user", {}, "   ");
		expect(created.id).toMatch(/^session-/);
		expect(created.id.trim().length).toBeGreaterThan(0);
		expect(await service.getSession("app", "user", created.id)).toBeDefined();
	});

	it("timestampToUnixSeconds treats exact 10000000000 as seconds", () => {
		const service = new DatabaseSessionService({
			db: {
				schema: {
					createTable: () => ({
						ifNotExists: () => ({
							addColumn: function addColumn() {
								return this;
							},
							execute: async () => undefined,
						}),
					}),
				},
			} as any,
			skipTableCreation: true,
		});
		expect((service as any).timestampToUnixSeconds(10_000_000_000)).toBe(
			10_000_000_000,
		);
		expect((service as any).timestampToUnixSeconds(10_000_000_001)).toBe(
			10_000_000_001 / 1000,
		);
		expect((service as any).timestampToUnixSeconds(9_999_999_999)).toBe(
			9_999_999_999,
		);
	});

	it("storageEventToEvent helpers treat non-object actions as empty", () => {
		const service = new DatabaseSessionService({
			db: {
				schema: {
					createTable: () => ({
						ifNotExists: () => ({
							addColumn: function addColumn() {
								return this;
							},
							execute: async () => undefined,
						}),
					}),
				},
			} as any,
			skipTableCreation: true,
		});

		for (const actions of ['"oops"', "42", "true", "null"]) {
			const event = (service as any).storageEventToEvent({
				id: "e1",
				app_name: "app",
				user_id: "user",
				session_id: "s1",
				invocation_id: "inv",
				author: "agent",
				branch: null,
				timestamp: new Date("2024-01-01T00:00:00.000Z"),
				content: null,
				actions,
				long_running_tool_ids_json: null,
				grounding_metadata: null,
				partial: null,
				turn_complete: null,
				error_code: null,
				error_message: null,
				interrupted: null,
			});
			expect(event.getFunctionCalls()).toEqual([]);
			expect(event.getFunctionResponses()).toEqual([]);
			expect(event.hasTrailingCodeExecutionResult()).toBe(false);
		}
	});

	it("ensureInitialized rethrows after constructor initializeDatabase failure", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const boom = new Error("schema boom");
		const db = {
			schema: {
				createTable: () => ({
					ifNotExists: () => ({
						addColumn: () => {
							throw boom;
						},
					}),
				}),
			},
		};

		const service = new DatabaseSessionService({ db: db as any });
		await new Promise((r) => setTimeout(r, 20));
		expect(errorSpy).toHaveBeenCalled();

		await expect(service.createSession("app", "user")).rejects.toThrow(
			/schema boom/,
		);
		errorSpy.mockRestore();
	});
});
