import { describe, expect, it, vi } from "vitest";
import {
	createDatabaseSessionService,
	createSqliteSessionService,
} from "../../sessions/database-factories";

vi.mock("../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

describe("database-factories", () => {
	it("rejects unsupported database URLs", () => {
		expect(() => createDatabaseSessionService("redis://localhost")).toThrow(
			"Unsupported database URL",
		);
	});

	it("routes sqlite:// and :memory: to the sqlite factory", () => {
		const memory = createDatabaseSessionService(":memory:");
		expect(memory).toBeDefined();
		expect(typeof memory.createSession).toBe("function");

		const fromUri = createDatabaseSessionService("sqlite://:memory:");
		expect(fromUri).toBeDefined();
	});

	it("creates a sqlite session service for .db paths", () => {
		const service = createSqliteSessionService(":memory:");
		expect(service).toBeDefined();
		expect(typeof service.getSession).toBe("function");
	});
});
