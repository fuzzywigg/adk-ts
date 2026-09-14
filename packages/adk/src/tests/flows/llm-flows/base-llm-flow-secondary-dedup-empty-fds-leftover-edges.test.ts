import type { InvocationContext } from "@adk/agents";
import { Event } from "@adk/events";
import { SingleFlow } from "@adk/flows";
import { LlmRequest } from "@adk/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handleFunctionCallsAsyncMock = vi.hoisted(() => vi.fn());
const generateAuthEventMock = vi.hoisted(() => vi.fn());
const populateClientFunctionCallIdMock = vi.hoisted(() => vi.fn());
const getLongRunningFunctionCallsMock = vi.hoisted(() => vi.fn());

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debugArray: vi.fn(),
		debugStructured: vi.fn(),
	})),
}));

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debugArray: vi.fn(),
		debugStructured: vi.fn(),
	})),
}));

vi.mock("@adk/flows/llm-flows/functions", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@adk/flows/llm-flows/functions")>();
	return {
		...actual,
		handleFunctionCallsAsync: handleFunctionCallsAsyncMock,
		generateAuthEvent: generateAuthEventMock,
		populateClientFunctionCallId: populateClientFunctionCallIdMock,
		getLongRunningFunctionCalls: getLongRunningFunctionCallsMock,
	};
});

class InspectableFlow extends SingleFlow {}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
	const items: T[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

function makeCtx(overrides: Record<string, unknown> = {}): InvocationContext {
	return {
		invocationId: "inv",
		branch: "main",
		session: { state: {}, events: [] },
		runConfig: {},
		incrementLlmCallCount: vi.fn(),
		...overrides,
	} as unknown as InvocationContext;
}

beforeEach(() => {
	handleFunctionCallsAsyncMock.mockReset();
	generateAuthEventMock.mockReset();
	populateClientFunctionCallIdMock.mockReset();
	getLongRunningFunctionCallsMock.mockReset();
	getLongRunningFunctionCallsMock.mockReturnValue(new Set());
});

describe("base-llm-flow sixth leftover: secondary dedup empty FDs (post #151)", () => {
	it("drops a tool whose functionDeclarations are all already-seen duplicates", async () => {
		const flow = new InspectableFlow();
		const agent = {
			name: "dedup-agent",
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { parts: [{ text: "ok" }] } };
				}),
			},
		};
		const llmRequest = new LlmRequest();
		llmRequest.config = {
			tools: [
				{
					functionDeclarations: [{ name: "shared" }, { name: "keep" }],
				},
				{
					functionDeclarations: [{ name: "shared" }, { name: "shared" }],
				},
			],
		} as any;

		await collect(
			flow._callLlmAsync(
				makeCtx({ agent }),
				llmRequest,
				new Event({ id: "m", author: "dedup-agent" }),
			),
		);

		const tools = (llmRequest.config?.tools as any[]) || [];
		expect(tools).toHaveLength(1);
		expect(tools[0].functionDeclarations?.map((f: any) => f.name)).toEqual([
			"shared",
			"keep",
		]);
	});

	it("drops a tool with an empty functionDeclarations array", async () => {
		const flow = new InspectableFlow();
		const agent = {
			name: "dedup-agent",
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { parts: [{ text: "ok" }] } };
				}),
			},
		};
		const llmRequest = new LlmRequest();
		llmRequest.config = {
			tools: [
				{ functionDeclarations: [] },
				{
					functionDeclarations: [{ name: "only" }],
				},
			],
		} as any;

		await collect(
			flow._callLlmAsync(
				makeCtx({ agent }),
				llmRequest,
				new Event({ id: "m", author: "dedup-agent" }),
			),
		);

		const tools = (llmRequest.config?.tools as any[]) || [];
		expect(tools).toHaveLength(1);
		expect(tools[0].functionDeclarations).toEqual([{ name: "only" }]);
	});

	it("keeps companion unnamed FDs even when named ones are all dupes", async () => {
		const flow = new InspectableFlow();
		const agent = {
			name: "dedup-agent",
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { parts: [{ text: "ok" }] } };
				}),
			},
		};
		const llmRequest = new LlmRequest();
		llmRequest.config = {
			tools: [
				{ functionDeclarations: [{ name: "x" }] },
				{
					functionDeclarations: [{ name: "x" }, { name: "" }, {}],
				},
			],
		} as any;

		await collect(
			flow._callLlmAsync(
				makeCtx({ agent }),
				llmRequest,
				new Event({ id: "m", author: "dedup-agent" }),
			),
		);

		const tools = (llmRequest.config?.tools as any[]) || [];
		expect(tools).toHaveLength(2);
		expect(tools[1].functionDeclarations).toEqual([{ name: "" }, {}]);
	});

	it("logs when dedup reduces tool count via emptied FD lists", async () => {
		const flow = new InspectableFlow();
		const debugSpy = vi.spyOn((flow as any).logger, "debug");
		const agent = {
			name: "dedup-agent",
			canonicalModel: {
				model: "fake",
				generateContentAsync: vi.fn(async function* () {
					yield { content: { parts: [{ text: "ok" }] } };
				}),
			},
		};
		const llmRequest = new LlmRequest();
		llmRequest.config = {
			tools: [
				{ functionDeclarations: [{ name: "a" }] },
				{ functionDeclarations: [{ name: "a" }] },
				{ functionDeclarations: [{ name: "a" }] },
			],
		} as any;

		await collect(
			flow._callLlmAsync(
				makeCtx({ agent }),
				llmRequest,
				new Event({ id: "m", author: "dedup-agent" }),
			),
		);

		expect(llmRequest.config?.tools).toHaveLength(1);
		expect(debugSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"Deduplicated tool/function declarations: 3 -> 1",
			),
		);
	});
});
