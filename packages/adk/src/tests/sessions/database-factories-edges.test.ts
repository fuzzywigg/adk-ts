import Module from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createDatabaseSessionService,
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

describe("database-factories leftover edges", () => {
	const originalRequire = Module.prototype.require;

	afterEach(() => {
		Module.prototype.require = originalRequire;
	});

	it("createDatabaseSessionService forwards options on mysql:// URLs", () => {
		const createPool = vi.fn().mockReturnValue({ end: vi.fn() });
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "mysql2") {
				return { createPool };
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		createDatabaseSessionService("mysql://localhost/db", {
			connectionLimit: 8,
		});
		expect(createPool).toHaveBeenCalledWith({
			uri: "mysql://localhost/db",
			connectionLimit: 8,
		});
	});

	it("strips sqlite:// prefix for relative and absolute-looking filenames", () => {
		const Database = vi.fn().mockImplementation(() => ({
			close: vi.fn(),
			prepare: vi.fn(),
		}));
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "better-sqlite3") {
				return Database;
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		createDatabaseSessionService("sqlite://relative.db");
		expect(Database).toHaveBeenCalledWith("relative.db", undefined);

		Database.mockClear();
		createDatabaseSessionService("sqlite:////tmp/abs.db", { readonly: true });
		expect(Database).toHaveBeenCalledWith("//tmp/abs.db", { readonly: true });
	});

	it("routes bare .db paths without a scheme to sqlite", () => {
		const Database = vi.fn().mockImplementation(() => ({
			close: vi.fn(),
			prepare: vi.fn(),
		}));
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "better-sqlite3") {
				return Database;
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		createDatabaseSessionService("/var/data/app.db");
		expect(Database).toHaveBeenCalledWith("/var/data/app.db", undefined);
	});

	it("routes postgres:// the same as postgresql://", () => {
		const Pool = vi.fn().mockImplementation(() => ({
			on: vi.fn(),
			end: vi.fn(),
			connect: vi.fn(),
		}));
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "pg") {
				return { Pool };
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		createDatabaseSessionService("postgres://localhost/db");
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgres://localhost/db",
		});
	});

	it("rejects mongodb and empty URLs as unsupported", () => {
		expect(() => createDatabaseSessionService("mongodb://localhost")).toThrow(
			/Unsupported database URL/,
		);
		expect(() => createDatabaseSessionService("")).toThrow(
			/Unsupported database URL/,
		);
		expect(() => createDatabaseSessionService("http://localhost")).toThrow(
			/Unsupported database URL/,
		);
	});

	it("missing-peer errors mention npm/pnpm/yarn install hints", () => {
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "pg") {
				throw new Error("Cannot find module 'pg'");
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		expect(() => createPostgresSessionService("postgresql://x")).toThrow(
			/npm install pg/,
		);
		expect(() => createPostgresSessionService("postgresql://x")).toThrow(
			/pnpm add pg/,
		);
		expect(() => createPostgresSessionService("postgresql://x")).toThrow(
			/yarn add pg/,
		);
	});

	it("createPostgresSessionService without options only passes connectionString", () => {
		const Pool = vi.fn().mockImplementation(() => ({
			on: vi.fn(),
			end: vi.fn(),
			connect: vi.fn(),
		}));
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "pg") {
				return { Pool };
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		createPostgresSessionService("postgresql://localhost/db");
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgresql://localhost/db",
		});
	});

	it("createSqliteSessionService without options omits the second ctor arg", () => {
		const Database = vi.fn().mockImplementation(() => ({
			close: vi.fn(),
			prepare: vi.fn(),
		}));
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "better-sqlite3") {
				return Database;
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		createSqliteSessionService("plain.db");
		expect(Database).toHaveBeenCalledWith("plain.db", undefined);
	});
});
