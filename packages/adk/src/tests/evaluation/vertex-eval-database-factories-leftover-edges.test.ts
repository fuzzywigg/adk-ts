import Module from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { VertexAiEvalFacade } from "../../evaluation/vertex-ai-eval-facade";
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

function invocation(opts: {
	user?: string;
	response?: string;
	userParts?: Array<{ text?: string }>;
	responseParts?: Array<{ text?: string }>;
}): Invocation {
	return {
		userContent: {
			parts: opts.userParts ?? [{ text: opts.user ?? "prompt" }],
		},
		finalResponse: {
			parts: opts.responseParts ?? [{ text: opts.response ?? "response" }],
		},
		creationTimestamp: 1,
	};
}

describe("VertexAiEvalFacade leftover edges (overnight TOKENMAXX post #150)", () => {
	const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
	const originalLocation = process.env.GOOGLE_CLOUD_LOCATION;

	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		process.env.GOOGLE_CLOUD_PROJECT = "test-project";
		process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
		vi.spyOn(Math, "random").mockReturnValue(0.5);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalProject === undefined) {
			delete process.env.GOOGLE_CLOUD_PROJECT;
		} else {
			process.env.GOOGLE_CLOUD_PROJECT = originalProject;
		}
		if (originalLocation === undefined) {
			delete process.env.GOOGLE_CLOUD_LOCATION;
		} else {
			process.env.GOOGLE_CLOUD_LOCATION = originalLocation;
		}
	});

	it("throws when actualInvocations is longer than expectedInvocations", async () => {
		vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockResolvedValue({
			summaryMetrics: [{ meanScore: 0.9 }],
		});
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});

		await expect(
			facade.evaluateInvocations(
				[invocation({ response: "a1" }), invocation({ response: "a2" })],
				[invocation({ response: "e1" })],
			),
		).rejects.toThrow();
	});

	it("joins multi-part text in order and keeps whitespace-only parts", async () => {
		const perform = vi
			.spyOn(VertexAiEvalFacade as never, "_performEval")
			.mockResolvedValue({ summaryMetrics: [{ meanScore: 0.8 }] });
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});

		await facade.evaluateInvocations(
			[
				invocation({
					responseParts: [{ text: "act-a" }, { text: "  " }, { text: "act-b" }],
				}),
			],
			[
				invocation({
					userParts: [{ text: "p1" }, { text: "p2" }],
					responseParts: [{ text: "ref-a" }, { text: "ref-b" }],
				}),
			],
		);

		expect(perform).toHaveBeenCalledWith(
			[
				{
					prompt: "p1\np2",
					reference: "ref-a\nref-b",
					response: "act-a\n  \nact-b",
				},
			],
			[PrebuiltMetrics.SAFETY_V1],
		);
	});

	it("_getEvalStatus treats explicit null score as NOT_EVALUATED", () => {
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});
		expect((facade as any)._getEvalStatus(null)).toBe(EvalStatus.NOT_EVALUATED);
		expect((facade as any)._getEvalStatus(undefined)).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect((facade as any)._getEvalStatus(0.5)).toBe(EvalStatus.PASSED);
		expect((facade as any)._getEvalStatus(0.49)).toBe(EvalStatus.FAILED);
	});

	it("overallScore stays undefined when all invocations fail evaluation", async () => {
		vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockRejectedValue(
			new Error("down"),
		);
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});
		const result = await facade.evaluateInvocations(
			[invocation({ response: "a" }), invocation({ response: "b" })],
			[invocation({ response: "e1" }), invocation({ response: "e2" })],
		);
		expect(result.perInvocationResults).toHaveLength(2);
		expect(result.overallScore).toBeUndefined();
		expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
	});

	it("live mock path with Math.random=1 yields score 1.0 PASS and warns", async () => {
		vi.spyOn(Math, "random").mockReturnValue(1);
		const facade = new VertexAiEvalFacade({
			threshold: 0.99,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});
		const result = await facade.evaluateInvocations(
			[invocation({ response: "a" })],
			[invocation({ response: "b" })],
		);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.overallScore).toBe(1);
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining("not fully implemented"),
		);
	});

	it("missing project and location errors include ERROR_MESSAGE_SUFFIX guidance", async () => {
		delete process.env.GOOGLE_CLOUD_PROJECT;
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});
		await facade.evaluateInvocations(
			[invocation({ response: "a" })],
			[invocation({ response: "b" })],
		);
		expect(console.error).toHaveBeenCalledWith(
			"Error evaluating invocation:",
			expect.objectContaining({
				message: expect.stringContaining("GOOGLE_CLOUD_PROJECT"),
			}),
		);

		process.env.GOOGLE_CLOUD_PROJECT = "test-project";
		delete process.env.GOOGLE_CLOUD_LOCATION;
		await facade.evaluateInvocations(
			[invocation({ response: "a" })],
			[invocation({ response: "b" })],
		);
		expect(console.error).toHaveBeenCalledWith(
			"Error evaluating invocation:",
			expect.objectContaining({
				message: expect.stringContaining("GOOGLE_CLOUD_LOCATION"),
			}),
		);
	});

	it("returns empty perInvocationResults when both lists are empty", async () => {
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});
		const result = await facade.evaluateInvocations([], []);
		expect(result).toEqual({
			overallScore: undefined,
			overallEvalStatus: EvalStatus.NOT_EVALUATED,
			perInvocationResults: [],
		});
	});
});

describe("database-factories leftover edges (overnight TOKENMAXX post #150)", () => {
	const originalRequire = Module.prototype.require;

	afterEach(() => {
		Module.prototype.require = originalRequire;
	});

	it.each([
		"Postgres://localhost/db",
		"MYSQL://localhost/db",
	])("rejects case-sensitive scheme %s as unsupported", (url) => {
		expect(() => createDatabaseSessionService(url)).toThrow(
			/Unsupported database URL/,
		);
	});

	it("SQLite://file.db still routes via .db substring to sqlite", () => {
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

		createDatabaseSessionService("SQLite://file.db");
		expect(Database).toHaveBeenCalledWith("SQLite://file.db", undefined);
	});

	it("routes http URLs containing .db mid-path to sqlite", () => {
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

		createDatabaseSessionService("http://host/path/file.db");
		expect(Database).toHaveBeenCalledWith(
			"http://host/path/file.db",
			undefined,
		);
	});

	it("sqlite:// with empty remainder still constructs sqlite service", () => {
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

		createDatabaseSessionService("sqlite://");
		expect(Database).toHaveBeenCalledWith("", undefined);
	});

	it("createDatabaseSessionService forwards options for :memory:", () => {
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

		createDatabaseSessionService(":memory:", { readonly: true });
		expect(Database).toHaveBeenCalledWith(":memory:", { readonly: true });
	});

	it("missing mysql2 peer error mentions npm/pnpm/yarn", () => {
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "mysql2") {
				throw new Error("Cannot find module 'mysql2'");
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		expect(() => createMysqlSessionService("mysql://x")).toThrow(
			/npm install mysql2/,
		);
		expect(() => createMysqlSessionService("mysql://x")).toThrow(
			/pnpm add mysql2/,
		);
		expect(() => createMysqlSessionService("mysql://x")).toThrow(
			/yarn add mysql2/,
		);
	});

	it("missing better-sqlite3 peer error mentions all package managers", () => {
		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "better-sqlite3") {
				throw new Error("Cannot find module 'better-sqlite3'");
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		expect(() => createSqliteSessionService(":memory:")).toThrow(
			/npm install better-sqlite3/,
		);
		expect(() => createSqliteSessionService(":memory:")).toThrow(
			/pnpm add better-sqlite3/,
		);
		expect(() => createSqliteSessionService(":memory:")).toThrow(
			/yarn add better-sqlite3/,
		);
	});

	it("createPostgresSessionService spreads options onto Pool config", () => {
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

		createPostgresSessionService("postgresql://localhost/db", {
			max: 4,
			idleTimeoutMillis: 1000,
		});
		expect(Pool).toHaveBeenCalledWith({
			connectionString: "postgresql://localhost/db",
			max: 4,
			idleTimeoutMillis: 1000,
		});
	});
});
