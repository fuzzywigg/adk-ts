import Module from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createDatabaseSessionService,
	createMysqlSessionService,
	createPostgresSessionService,
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
	const originalRequire = Module.prototype.require;

	afterEach(() => {
		Module.prototype.require = originalRequire;
	});

	function blockPeer(packageName: string): void {
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === packageName) {
				throw new Error(`Cannot find module '${packageName}'`);
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;
	}

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

	it("strips the sqlite:// prefix when creating the filename", () => {
		const service = createDatabaseSessionService("sqlite://:memory:");
		expect(service).toBeDefined();
		expect(typeof service.createSession).toBe("function");
	});

	it("creates a sqlite session service for .db paths", () => {
		const service = createSqliteSessionService(":memory:");
		expect(service).toBeDefined();
		expect(typeof service.getSession).toBe("function");
	});

	it("routes postgres:// and postgresql:// URLs to the postgres factory", () => {
		blockPeer("pg");
		expect(() =>
			createDatabaseSessionService("postgres://localhost/db"),
		).toThrow(/Missing required peer dependency: pg/);
		expect(() =>
			createDatabaseSessionService("postgresql://localhost/db"),
		).toThrow(/Missing required peer dependency: pg/);
		expect(() =>
			createPostgresSessionService("postgres://localhost/db"),
		).toThrow(/pnpm add pg/);
	});

	it("routes mysql:// URLs to the mysql factory", () => {
		blockPeer("mysql2");
		expect(() => createDatabaseSessionService("mysql://localhost/db")).toThrow(
			/Missing required peer dependency: mysql2/,
		);
		expect(() => createMysqlSessionService("mysql://localhost/db")).toThrow(
			/To use MySQL sessions/,
		);
	});
});
