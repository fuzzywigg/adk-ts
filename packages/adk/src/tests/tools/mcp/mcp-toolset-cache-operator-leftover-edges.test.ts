import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpError, McpErrorType } from "../../../tools/mcp/types";

const initialize = vi.fn();
const close = vi.fn();
const setSamplingHandler = vi.fn();
const removeSamplingHandler = vi.fn();
const listTools = vi.fn();
const convertMcpToolToBaseTool = vi.fn();
const McpClientServiceMock = vi.fn();

vi.mock("../../../tools/mcp/client", () => ({
	McpClientService: McpClientServiceMock,
}));

vi.mock("../../../tools/mcp/create-tool", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../../tools/mcp/create-tool")>();
	return {
		...actual,
		convertMcpToolToBaseTool: (...args: unknown[]) =>
			convertMcpToolToBaseTool(...args),
	};
});

const { McpToolset } = await import("../../../tools/mcp");

const baseConfig = {
	name: "cache-unit",
	description: "cache operator leftover edges for MCP toolset",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-cache"],
	},
};

function fakeBaseTool(name: string) {
	return {
		name,
		description: `${name} tool`,
	} as any;
}

function defaultToolsPayload() {
	return {
		tools: [
			{
				name: "alpha",
				description: "alpha tool",
				inputSchema: { type: "object", properties: {} },
			},
			{
				name: "beta",
				description: "beta tool",
				inputSchema: { type: "object", properties: {} },
			},
		],
	};
}

beforeEach(() => {
	initialize.mockReset();
	close.mockReset();
	setSamplingHandler.mockReset();
	removeSamplingHandler.mockReset();
	listTools.mockReset();
	convertMcpToolToBaseTool.mockReset();
	McpClientServiceMock.mockReset();

	initialize.mockResolvedValue(undefined);
	close.mockResolvedValue(undefined);
	listTools.mockResolvedValue(defaultToolsPayload());
	convertMcpToolToBaseTool.mockImplementation(async ({ mcpTool }: any) =>
		fakeBaseTool(mcpTool.name),
	);

	McpClientServiceMock.mockImplementation(function McpClientService() {
		return {
			initialize: async () => {
				await initialize();
				return { listTools };
			},
			close,
			setSamplingHandler,
			removeSamplingHandler,
		};
	});
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("McpToolset cache operator leftover edges (post #141)", () => {
	it.each([
		{
			label: "enabled true",
			cacheConfig: { enabled: true },
			earlyReturn: true,
		},
		{
			label: "enabled false",
			cacheConfig: { enabled: false },
			earlyReturn: false,
		},
		{
			label: "cacheConfig omitted",
			cacheConfig: undefined,
			earlyReturn: false,
		},
		{ label: "empty cacheConfig", cacheConfig: {}, earlyReturn: false },
		{
			label: "enabled undefined",
			cacheConfig: { enabled: undefined },
			earlyReturn: false,
		},
	])("$label: early-return uses !enabled === false (earlyReturn=$earlyReturn)", async ({
		cacheConfig,
		earlyReturn,
	}) => {
		const toolset = new McpToolset({
			...baseConfig,
			...(cacheConfig === undefined ? {} : { cacheConfig }),
		});
		(toolset as any).tools = [fakeBaseTool("stale")];

		const result = await toolset.getTools();
		if (earlyReturn) {
			expect(result.map((t) => t.name)).toEqual(["stale"]);
			expect(listTools).not.toHaveBeenCalled();
		} else {
			expect(listTools).toHaveBeenCalledTimes(1);
			expect(result.map((t) => t.name).sort()).toEqual(["alpha", "beta"]);
		}
	});

	it.each([
		{ enabled: 1 as any, earlyReturn: true, stores: true },
		// `0 !== false` is true under strict inequality, so store path still caches.
		{ enabled: 0 as any, earlyReturn: false, stores: true },
		{ enabled: "yes" as any, earlyReturn: true, stores: true },
		{ enabled: "" as any, earlyReturn: false, stores: true },
		{ enabled: {} as any, earlyReturn: true, stores: true },
		{ enabled: null as any, earlyReturn: false, stores: true },
		{ enabled: false, earlyReturn: false, stores: false },
	])("truthy/falsy non-boolean enabled=$enabled → earlyReturn=$earlyReturn stores=$stores", async ({
		enabled,
		earlyReturn,
		stores,
	}) => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled },
		});
		if (earlyReturn) {
			(toolset as any).tools = [fakeBaseTool("preseed")];
		} else {
			(toolset as any).tools = [];
		}

		const first = await toolset.getTools();
		if (earlyReturn) {
			expect(first.map((t) => t.name)).toEqual(["preseed"]);
			expect(listTools).not.toHaveBeenCalled();
			return;
		}

		expect(listTools).toHaveBeenCalledTimes(1);
		if (stores) {
			expect((toolset as any).tools.map((t: any) => t.name).sort()).toEqual([
				"alpha",
				"beta",
			]);
		} else {
			expect((toolset as any).tools).toEqual([]);
		}

		listTools.mockClear();
		await toolset.getTools();
		const shouldEarlyReturnNext = !enabled === false;
		expect(listTools).toHaveBeenCalledTimes(shouldEarlyReturnNext ? 0 : 1);
	});

	it("store path uses enabled !== false while early-return uses !enabled === false", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: true },
		});

		const first = await toolset.getTools();
		expect((toolset as any).tools).toBe(first);
		expect(listTools).toHaveBeenCalledTimes(1);

		const second = await toolset.getTools();
		expect(second).toBe(first);
		expect(listTools).toHaveBeenCalledTimes(1);

		await toolset.refreshTools();
		expect(listTools).toHaveBeenCalledTimes(2);
		expect((toolset as any).tools.map((t: any) => t.name).sort()).toEqual([
			"alpha",
			"beta",
		]);
	});

	it("does not store when enabled is false even after successful list", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: false },
		});
		const tools = await toolset.getTools();
		expect(tools).toHaveLength(2);
		expect((toolset as any).tools).toEqual([]);
		await toolset.getTools();
		expect(listTools).toHaveBeenCalledTimes(2);
	});

	it("caches successful subset when one conversion fails and enabled is true", async () => {
		convertMcpToolToBaseTool.mockImplementation(async ({ mcpTool }: any) => {
			if (mcpTool.name === "alpha") {
				throw new Error("alpha schema boom");
			}
			return fakeBaseTool(mcpTool.name);
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: true },
		});

		const first = await toolset.getTools();
		expect(first.map((t) => t.name)).toEqual(["beta"]);
		expect((toolset as any).tools).toBe(first);

		listTools.mockClear();
		const second = await toolset.getTools();
		expect(second).toBe(first);
		expect(listTools).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it("array filter × cache on/off matrix", async () => {
		const enabled = new McpToolset(
			{ ...baseConfig, cacheConfig: { enabled: true } },
			["alpha"],
		);
		const disabled = new McpToolset(
			{ ...baseConfig, cacheConfig: { enabled: false } },
			["beta"],
		);

		const a1 = await enabled.getTools();
		const b1 = await disabled.getTools();
		expect(a1.map((t) => t.name)).toEqual(["alpha"]);
		expect(b1.map((t) => t.name)).toEqual(["beta"]);

		listTools.mockClear();
		const a2 = await enabled.getTools();
		const b2 = await disabled.getTools();
		expect(a2).toBe(a1);
		expect(b2.map((t) => t.name)).toEqual(["beta"]);
		expect(listTools).toHaveBeenCalledTimes(1);
	});

	it("predicate filter receives context and still caches when enabled", async () => {
		const seen: string[] = [];
		const toolset = new McpToolset(
			{ ...baseConfig, cacheConfig: { enabled: true } },
			(tool, ctx) => {
				seen.push(`${tool.name}:${(ctx as any)?.tag ?? "none"}`);
				return tool.name === "beta";
			},
		);
		const ctx = { tag: "ctx-a" } as any;
		const first = await toolset.getTools(ctx);
		expect(first.map((t) => t.name)).toEqual(["beta"]);
		expect(seen).toEqual(["alpha:ctx-a", "beta:ctx-a"]);

		seen.length = 0;
		listTools.mockClear();
		const second = await toolset.getTools({ tag: "ctx-b" } as any);
		expect(second).toBe(first);
		expect(seen).toEqual([]);
		expect(listTools).not.toHaveBeenCalled();
	});

	it("weird non-array non-function filter fallthrough still caches when enabled", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: true },
		});
		(toolset as any).toolFilter = { include: "everything" };
		const first = await toolset.getTools();
		expect(first).toHaveLength(2);
		listTools.mockClear();
		expect(await toolset.getTools()).toBe(first);
		expect(listTools).not.toHaveBeenCalled();
	});

	it("maxAge/maxSize cacheConfig fields do not change list/cache behavior today", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: true, maxAge: 1, maxSize: 1 },
		});
		const first = await toolset.getTools();
		expect(first).toHaveLength(2);
		listTools.mockClear();
		expect(await toolset.getTools()).toBe(first);
		expect(listTools).not.toHaveBeenCalled();
	});

	it("empty tools cache still early-returns when enabled true and tools length > 0 only", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: true },
		});
		(toolset as any).tools = [];
		await toolset.getTools();
		expect(listTools).toHaveBeenCalledTimes(1);
	});

	it("refreshTools clears then re-caches under enabled true", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: true },
		});
		const first = await toolset.getTools();
		listTools.mockResolvedValue({
			tools: [
				{
					name: "gamma",
					description: "gamma tool",
					inputSchema: { type: "object", properties: {} },
				},
			],
		});
		const refreshed = await toolset.refreshTools();
		expect(refreshed.map((t) => t.name)).toEqual(["gamma"]);
		expect((toolset as any).tools).toBe(refreshed);
		expect(refreshed).not.toBe(first);
	});

	it("getTools while closing still rejects before cache short-circuit", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: true },
		});
		(toolset as any).tools = [fakeBaseTool("cached")];
		(toolset as any).isClosing = true;
		await expect(toolset.getTools()).rejects.toMatchObject({
			type: McpErrorType.RESOURCE_CLOSED_ERROR,
		});
		expect(listTools).not.toHaveBeenCalled();
	});

	it("rethrows McpError from listTools without wrapping even when cache enabled", async () => {
		const original = new McpError("typed", McpErrorType.TIMEOUT_ERROR);
		listTools.mockRejectedValue(original);
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: true },
		});
		await expect(toolset.getTools()).rejects.toBe(original);
		expect((toolset as any).tools).toEqual([]);
	});
});
