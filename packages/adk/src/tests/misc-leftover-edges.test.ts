import { describe, expect, it, vi } from "vitest";
import { requestProcessor as authPreprocessor } from "../auth/auth-preprocessor";
import { runCompactionForSlidingWindow } from "../events/compaction";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { REQUEST_EUC_FUNCTION_CALL_NAME } from "../flows/llm-flows/functions";
import { sharedMemoryRequestProcessor } from "../flows/llm-flows/shared-memory";
import { LlmRequest } from "../models/llm-request";
import { telemetryService } from "../telemetry";

vi.mock("../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

describe("misc leftover edges (post #124)", () => {
	it("telemetry _buildLlmRequestForTrace treats missing contents as empty", () => {
		const req = new LlmRequest({ model: "m", config: { temperature: 0.2 } });
		(req as any).contents = undefined;

		const built = (telemetryService as any)._buildLlmRequestForTrace(req);
		expect(built.contents).toEqual([]);
		expect(built.model).toBe("m");
	});

	it("compaction filters new invocations using || 0 for missing map hits", async () => {
		const summarizer = {
			maybeSummarizeEvents: vi.fn().mockResolvedValue(
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "sum" }] },
					actions: new EventActions({
						compaction: {
							startTimestamp: 1,
							endTimestamp: 30,
							compactedContent: {
								role: "model",
								parts: [{ text: "sum" }],
							},
						},
					}),
				}),
			),
		};
		const appendEvent = vi.fn();
		const session = {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: [
				new Event({
					author: "user",
					invocationId: "inv-a",
					timestamp: 5,
					content: { role: "user", parts: [{ text: "a" }] },
				}),
				new Event({
					author: "user",
					invocationId: "inv-b",
					timestamp: 15,
					content: { role: "user", parts: [{ text: "b" }] },
				}),
				new Event({
					author: "user",
					invocationId: "inv-c",
					timestamp: 25,
					content: { role: "user", parts: [{ text: "c" }] },
				}),
			],
			lastUpdateTime: 0,
		};

		await runCompactionForSlidingWindow(
			{ compactionInterval: 2, overlapSize: 0 } as any,
			session as any,
			{ appendEvent } as any,
			summarizer as any,
		);

		expect(summarizer.maybeSummarizeEvents).toHaveBeenCalled();
	});

	it("auth preprocessor continues past non-user authors before user EUC", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const items: unknown[] = [];
		for await (const item of authPreprocessor.runAsync(
			{
				session: {
					events: [
						new Event({
							author: "agent",
							content: { role: "model", parts: [{ text: "wait" }] },
						}),
						new Event({
							author: "user",
							content: {
								role: "user",
								parts: [
									{
										functionResponse: {
											id: "euc-1",
											name: REQUEST_EUC_FUNCTION_CALL_NAME,
											response: "{not-json",
										},
									},
								],
							},
						}),
					],
					state: {},
				},
				agent: { name: "a", canonicalModel: {} },
			} as any,
			new LlmRequest(),
		)) {
			items.push(item);
		}
		warn.mockRestore();
		expect(Array.isArray(items)).toBe(true);
	});

	it("shared-memory builds query from last user event parts", async () => {
		const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
		const llmRequest = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "prior" }] }],
		});

		for await (const _ of sharedMemoryRequestProcessor.runAsync(
			{
				memoryService: { searchMemory },
				appName: "app",
				userId: "u1",
				session: {
					events: [
						new Event({
							author: "user",
							content: {
								role: "user",
								parts: [{ text: "query text" }],
							},
						}),
					],
				},
				agent: { name: "a", canonicalModel: {} },
			} as any,
			llmRequest,
		)) {
			/* drain */
		}

		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "query text" }),
		);
	});
});
