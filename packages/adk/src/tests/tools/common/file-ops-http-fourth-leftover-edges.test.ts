import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Type } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileOperationsTool } from "../../../tools/common/file-operations-tool";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("FileOperationsTool fourth leftover coalesce/validation/error matrices", () => {
	let basePath: string;
	let tool: FileOperationsTool;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-file-4th-"));
		tool = new FileOperationsTool({ basePath });
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
	});

	it("declaration schema locks name, required fields, and enum values", () => {
		const declaration = tool.getDeclaration();
		expect(tool.name).toBe("file_operations");
		expect(declaration.name).toBe("file_operations");
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
		expect(declaration.parameters?.required).toEqual(["operation", "filepath"]);
		expect(declaration.parameters?.properties?.operation?.enum).toEqual([
			"read",
			"write",
			"append",
			"delete",
			"exists",
			"list",
			"mkdir",
		]);
		expect(declaration.parameters?.properties?.encoding?.default).toBe("utf8");
	});

	const writeCoalesce: Array<{
		label: string;
		content?: string;
		expected: string;
	}> = [
		{ label: "undefined content", content: undefined, expected: "" },
		{ label: "empty string", content: "", expected: "" },
		{ label: "whitespace", content: "  ", expected: "  " },
		{ label: "unicode", content: "café 漢字", expected: "café 漢字" },
		{ label: "multiline", content: "a\nb\nc", expected: "a\nb\nc" },
	];

	for (const { label, content, expected } of writeCoalesce) {
		it(`write coalesce: ${label}`, async () => {
			const filepath = `write-${label.replace(/\s+/g, "-")}.txt`;
			await expect(
				tool.runAsync({ operation: "write", filepath, content }, makeContext()),
			).resolves.toEqual({ success: true });
			await expect(
				tool.runAsync({ operation: "read", filepath }, makeContext()),
			).resolves.toEqual({ success: true, data: expected });
		});
	}

	const appendCoalesce: Array<{
		label: string;
		initial: string;
		append?: string;
		expected: string;
	}> = [
		{
			label: "undefined append keeps prior",
			initial: "base",
			append: undefined,
			expected: "base",
		},
		{
			label: "empty append is no-op textually",
			initial: "base",
			append: "",
			expected: "base",
		},
		{
			label: "suffix append",
			initial: "hello",
			append: " world",
			expected: "hello world",
		},
		{
			label: "newline append",
			initial: "line1",
			append: "\nline2",
			expected: "line1\nline2",
		},
	];

	for (const { label, initial, append, expected } of appendCoalesce) {
		it(`append coalesce: ${label}`, async () => {
			const filepath = `append-${label.replace(/\s+/g, "-")}.txt`;
			await tool.runAsync(
				{ operation: "write", filepath, content: initial },
				makeContext(),
			);
			await tool.runAsync(
				{ operation: "append", filepath, content: append },
				makeContext(),
			);
			await expect(
				tool.runAsync({ operation: "read", filepath }, makeContext()),
			).resolves.toEqual({ success: true, data: expected });
		});
	}

	const pathDenial: Array<{ label: string; filepath: string }> = [
		{ label: "relative parent", filepath: "../escape.txt" },
		{ label: "nested parent", filepath: "sub/../../escape.txt" },
		{
			label: "absolute outside",
			filepath: path.join(os.tmpdir(), "outside-adk-4th.txt"),
		},
	];

	for (const { label, filepath } of pathDenial) {
		it(`path validation denies: ${label}`, async () => {
			const result = await tool.runAsync(
				{ operation: "read", filepath },
				makeContext(),
			);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/Access denied/i);
		});
	}

	it("absolute path inside basePath is allowed", async () => {
		const inside = path.join(basePath, "abs-ok.txt");
		await tool.runAsync(
			{ operation: "write", filepath: inside, content: "ok" },
			makeContext(),
		);
		await expect(
			tool.runAsync({ operation: "read", filepath: inside }, makeContext()),
		).resolves.toEqual({ success: true, data: "ok" });
	});

	const unsupportedOps = ["chmod", "rename", "stat", "symlink", ""] as const;

	for (const operation of unsupportedOps) {
		it(`unsupported operation envelope: ${JSON.stringify(operation)}`, async () => {
			const result = await tool.runAsync(
				{ operation: operation as any, filepath: "x.txt" },
				makeContext(),
			);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/Unsupported operation/i);
		});
	}

	it("read missing file returns Failed to read file", async () => {
		const result = await tool.runAsync(
			{ operation: "read", filepath: "missing-4th.txt" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/^Failed to read file:/);
	});

	it("delete missing file returns Failed to delete file", async () => {
		const result = await tool.runAsync(
			{ operation: "delete", filepath: "gone.txt" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/^Failed to delete file:/);
	});

	it("list missing directory returns Failed to list directory", async () => {
		const result = await tool.runAsync(
			{ operation: "list", filepath: "no-dir" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/^Failed to list directory:/);
	});

	it("exists is true after write and false after delete", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "toggle.txt", content: "1" },
			makeContext(),
		);
		await expect(
			tool.runAsync(
				{ operation: "exists", filepath: "toggle.txt" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: true });
		await tool.runAsync(
			{ operation: "delete", filepath: "toggle.txt" },
			makeContext(),
		);
		await expect(
			tool.runAsync(
				{ operation: "exists", filepath: "toggle.txt" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: false });
	});

	it("mkdir nested then list parent includes child dir", async () => {
		await expect(
			tool.runAsync(
				{ operation: "mkdir", filepath: "nest/deep" },
				makeContext(),
			),
		).resolves.toEqual({ success: true });
		const listed = await tool.runAsync(
			{ operation: "list", filepath: "nest" },
			makeContext(),
		);
		expect(listed.success).toBe(true);
		const names = (
			listed.data as Array<{ name: string; isDirectory: boolean }>
		).map((e) => e.name);
		expect(names).toContain("deep");
	});

	it("list entry shape includes isFile/isDirectory/size for a written file", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "dir/item.txt", content: "abc" },
			makeContext(),
		);
		const listed = await tool.runAsync(
			{ operation: "list", filepath: "dir" },
			makeContext(),
		);
		const item = (listed.data as Array<Record<string, unknown>>).find(
			(e) => e.name === "item.txt",
		);
		expect(item).toMatchObject({
			name: "item.txt",
			isFile: true,
			isDirectory: false,
			size: 3,
		});
		expect(typeof item?.path).toBe("string");
	});

	it("encoding utf8 round-trips and latin1 still succeeds for ascii", async () => {
		await tool.runAsync(
			{
				operation: "write",
				filepath: "enc.txt",
				content: "plain",
				encoding: "utf8",
			},
			makeContext(),
		);
		await expect(
			tool.runAsync(
				{ operation: "read", filepath: "enc.txt", encoding: "utf8" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: "plain" });
		await expect(
			tool.runAsync(
				{ operation: "read", filepath: "enc.txt", encoding: "latin1" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: "plain" });
	});
});

describe("HttpRequestTool fourth leftover coalesce/validation/error matrices", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	function mockFetch(
		overrides: { status?: number; headers?: Headers; body?: string } = {},
	) {
		const fetchMock = vi.fn().mockResolvedValue({
			status: overrides.status ?? 200,
			headers: overrides.headers ?? new Headers(),
			text: async () => overrides.body ?? "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;
		return fetchMock;
	}

	it("declaration requires url and defaults method/timeout", () => {
		const tool = new HttpRequestTool();
		const declaration = tool.getDeclaration();
		expect(tool.name).toBe("http_request");
		expect(declaration.parameters?.required).toEqual(["url"]);
		expect(declaration.parameters?.properties?.method?.default).toBe("GET");
		expect(declaration.parameters?.properties?.timeout?.default).toBe(10000);
		expect(declaration.parameters?.properties?.method?.enum).toEqual([
			"GET",
			"POST",
			"PUT",
			"DELETE",
			"PATCH",
			"HEAD",
			"OPTIONS",
		]);
	});

	const methods = [
		"GET",
		"POST",
		"PUT",
		"DELETE",
		"PATCH",
		"HEAD",
		"OPTIONS",
	] as const;

	for (const method of methods) {
		it(`forwards method ${method}`, async () => {
			const tool = new HttpRequestTool();
			const fetchMock = mockFetch({ status: 204, body: "" });
			await tool.runAsync(
				{ url: "https://example.com/m", method },
				makeContext(),
			);
			expect(fetchMock.mock.calls[0][1].method).toBe(method);
		});
	}

	it("defaults method to GET when omitted", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockFetch();
		await tool.runAsync({ url: "https://example.com/" }, makeContext());
		expect(fetchMock.mock.calls[0][1].method).toBe("GET");
	});

	it("coalesces missing headers to empty object", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockFetch();
		await tool.runAsync({ url: "https://example.com/h" }, makeContext());
		expect(fetchMock.mock.calls[0][1].headers).toEqual({});
	});

	it("appends params onto URLs that already have a query string", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockFetch();
		await tool.runAsync(
			{
				url: "https://example.com/search?existing=1",
				params: { q: "adk", page: "3" },
			},
			makeContext(),
		);
		const calledUrl = String(fetchMock.mock.calls[0][0]);
		expect(calledUrl).toContain("existing=1");
		expect(calledUrl).toContain("q=adk");
		expect(calledUrl).toContain("page=3");
	});

	it("does not set Content-Type for non-JSON body strings", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockFetch();
		await tool.runAsync(
			{
				url: "https://example.com/plain",
				method: "POST",
				body: "not-json",
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
	});

	it("sets Content-Type for valid JSON body when header absent", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockFetch();
		await tool.runAsync(
			{
				url: "https://example.com/json",
				method: "POST",
				body: '{"x":1}',
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe(
			"application/json",
		);
	});

	it("preserves explicit Content-Type even for JSON body", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockFetch();
		await tool.runAsync(
			{
				url: "https://example.com/json",
				method: "POST",
				headers: { "Content-Type": "text/plain" },
				body: '{"x":1}',
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe(
			"text/plain",
		);
	});

	it("returns statusCode, headers map, and body from response", async () => {
		const tool = new HttpRequestTool();
		mockFetch({
			status: 201,
			headers: new Headers({ "x-id": "9", "content-type": "text/plain" }),
			body: "created",
		});
		await expect(
			tool.runAsync({ url: "https://example.com/create" }, makeContext()),
		).resolves.toEqual({
			statusCode: 201,
			headers: { "x-id": "9", "content-type": "text/plain" },
			body: "created",
		});
	});

	it("Error fetch rejection uses error.message", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockRejectedValue(new Error("timed out")) as any;
		await expect(
			tool.runAsync({ url: "https://example.com" }, makeContext()),
		).resolves.toEqual({
			statusCode: 0,
			headers: {},
			body: "",
			error: "timed out",
		});
	});

	it("non-Error fetch rejection stringifies", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockRejectedValue({ code: 42 }) as any;
		const result = await tool.runAsync(
			{ url: "https://example.com" },
			makeContext(),
		);
		expect(result.statusCode).toBe(0);
		expect(result.headers).toEqual({});
		expect(result.body).toBe("");
		expect(result.error).toBe("[object Object]");
	});

	it("invalid URL yields statusCode 0 error envelope", async () => {
		const tool = new HttpRequestTool();
		const result = await tool.runAsync({ url: "not-a-url" }, makeContext());
		expect(result.statusCode).toBe(0);
		expect(result.body).toBe("");
		expect(result.headers).toEqual({});
		expect(result.error).toBeTruthy();
	});

	it("forwards custom headers verbatim", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockFetch();
		await tool.runAsync(
			{
				url: "https://example.com/auth",
				headers: { Authorization: "Bearer t", "X-Trace": "1" },
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			Authorization: "Bearer t",
			"X-Trace": "1",
		});
	});

	it("passes body through for POST", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockFetch();
		await tool.runAsync(
			{
				url: "https://example.com/post",
				method: "POST",
				body: '{"a":2}',
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].body).toBe('{"a":2}');
	});
});
