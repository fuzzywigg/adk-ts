import { describe, expect, it } from "vitest";
import * as sessions from "../../sessions";

describe("sessions barrel exports", () => {
	it("exposes session model and state helpers", () => {
		expect(sessions.State.APP_PREFIX).toBe("app:");
		expect(sessions.State.USER_PREFIX).toBe("user:");
		expect(sessions.State.TEMP_PREFIX).toBe("temp:");
		expect(typeof sessions.State.create).toBe("function");
	});

	it("exposes in-memory, vertex, and database session services", () => {
		expect(typeof sessions.InMemorySessionService).toBe("function");
		expect(typeof sessions.VertexAiSessionService).toBe("function");
		expect(typeof sessions.DatabaseSessionService).toBe("function");
		expect(typeof sessions.BaseSessionService).toBe("function");
	});

	it("exposes database factory helpers", () => {
		expect(typeof sessions.createSqliteSessionService).toBe("function");
		expect(typeof sessions.createPostgresSessionService).toBe("function");
		expect(typeof sessions.createMysqlSessionService).toBe("function");
		expect(typeof sessions.createDatabaseSessionService).toBe("function");
	});

	it("createDatabaseSessionService builds a usable sqlite memory service", async () => {
		const service = sessions.createDatabaseSessionService(":memory:");
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		expect(session.id).toBe("s1");
		expect(session.state.a).toBe(1);
	});
});
