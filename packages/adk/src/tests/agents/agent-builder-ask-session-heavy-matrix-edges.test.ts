import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { Event } from "../../events/event.js";
import { Runner } from "../../runners.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";
import type { LlmRequest } from "../../models/llm-request.js";

function mockRunnerEvents(events: Event[]) {
	vi.spyOn(Runner.prototype, "runAsync").mockImplementation(async function* () {
		for (const event of events) {
			yield event;
		}
	});
	vi.spyOn(Runner.prototype, "rewind").mockResolvedValue(undefined as never);
}

describe("AgentBuilder ask/session heavy matrix leftover edges", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	describe("string and multi-agent ask paths", () => {
		it("ask via string message returns trimmed combined response", async () => {
			mockRunnerEvents([
				new Event({
					author: "solo",
					content: { parts: [{ text: "  hello  " }] },
				}),
			]);
			const { runner } = await AgentBuilder.create("str_ask")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, { userId: "u", appName: "a" })
				.build();
			await expect(runner.ask("go")).resolves.toBe("hello");
		});

		it.each([
			{ type: "sequential" as const, method: "asSequential" as const },
			{ type: "parallel" as const, method: "asParallel" as const },
		])("$type multi-agent returns per-agent array with empty missing authors", async ({
			method,
		}) => {
			const alpha = new LlmAgent({ name: "alpha", model: "gemini-2.5-flash" });
			const beta = new LlmAgent({ name: "beta", model: "gemini-2.5-flash" });
			const gamma = new LlmAgent({
				name: "gamma",
				model: "gemini-2.5-flash",
			});
			mockRunnerEvents([
				new Event({
					author: "alpha",
					content: { parts: [{ text: "A" }] },
				}),
				new Event({
					author: "beta",
					content: { parts: [{ text: "B" }] },
				}),
			]);
			let builder = AgentBuilder.create("multi_mx");
			builder =
				method === "asSequential"
					? builder.asSequential([alpha, beta, gamma])
					: builder.asParallel([alpha, beta, gamma]);
			const { runner } = await builder
				.withSessionService(sessionService, { userId: "u", appName: "a" })
				.build();
			await expect(runner.ask("go")).resolves.toEqual([
				{ agent: "alpha", response: "A" },
				{ agent: "beta", response: "B" },
				{ agent: "gamma", response: "" },
			]);
		});
	});

	describe("outputSchema parse matrix", () => {
		it("JSON parse success returns parsed object", async () => {
			mockRunnerEvents([
				new Event({
					author: "schema",
					content: { parts: [{ text: '{"value":"ok"}' }] },
				}),
			]);
			const schema = z.object({ value: z.string() });
			const { runner } = await AgentBuilder.create("parse_ok")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(schema)
				.withSessionService(sessionService, { userId: "u", appName: "a" })
				.build();
			await expect(runner.ask("q")).resolves.toEqual({ value: "ok" });
		});

		it("parse fail then zod on raw succeeds", async () => {
			mockRunnerEvents([
				new Event({
					author: "schema",
					content: { parts: [{ text: "plain-text" }] },
				}),
			]);
			const schema = z.string();
			const { runner } = await AgentBuilder.create("parse_fallback")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(schema)
				.withSessionService(sessionService, { userId: "u", appName: "a" })
				.build();
			await expect(runner.ask("q")).resolves.toBe("plain-text");
		});

		it("both fail throws combined message with raw output", async () => {
			mockRunnerEvents([
				new Event({
					author: "schema",
					content: { parts: [{ text: "{bad json" }] },
				}),
			]);
			const schema = z.object({ value: z.string() });
			const { runner } = await AgentBuilder.create("both_fail")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(schema)
				.withSessionService(sessionService, { userId: "u", appName: "a" })
				.build();
			await expect(runner.ask("q")).rejects.toThrow(/JSON parse error:/);
			await expect(runner.ask("q")).rejects.toThrow(/Zod validation error:/);
			await expect(runner.ask("q")).rejects.toThrow(/Raw output:/);
		});

		it.each([
			{
				label: "non-Error JSON parse",
				text: "{bad",
				parseThrow: "plain-parse",
				schemaThrow: new Error("zod-msg"),
			},
			{
				label: "non-Error Zod validation",
				text: '{"value":1}',
				parseThrow: new Error("parse-ok"),
				schemaThrow: "plain-zod",
			},
		])("$label stringifies failures", async ({ text, schemaThrow }) => {
			mockRunnerEvents([
				new Event({
					author: "schema",
					content: { parts: [{ text }] },
				}),
			]);
			const throwingSchema = {
				parse: () => {
					throw schemaThrow;
				},
			} as any;
			const { runner } = await AgentBuilder.create("non_err")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(throwingSchema)
				.withSessionService(sessionService, { userId: "u", appName: "a" })
				.build();
			const expected =
				schemaThrow instanceof Error
					? schemaThrow.message
					: String(schemaThrow);
			await expect(runner.ask("q")).rejects.toThrow(expected);
		});
	});

	describe("author buffering and LlmRequest path", () => {
		it("ignores user author in per-agent buffers", async () => {
			mockRunnerEvents([
				new Event({
					author: "user",
					content: { parts: [{ text: "ignored" }] },
				}),
				new Event({
					author: "agent_x",
					content: { parts: [{ text: "kept" }] },
				}),
			]);
			const sub = new LlmAgent({ name: "agent_x", model: "gemini-2.5-flash" });
			const { runner } = await AgentBuilder.create("user_skip")
				.asParallel([sub])
				.withSessionService(sessionService, { userId: "u", appName: "a" })
				.build();
			await expect(runner.ask("go")).resolves.toEqual([
				{ agent: "agent_x", response: "kept" },
			]);
		});

		it("LlmRequest-shaped message uses last contents parts", async () => {
			const captured: unknown[] = [];
			vi.spyOn(Runner.prototype, "runAsync").mockImplementation(
				async function* (params: any) {
					captured.push(params.newMessage);
					yield new Event({
						author: "solo",
						content: { parts: [{ text: "from-request" }] },
					});
				},
			);
			const { runner } = await AgentBuilder.create("llm_req")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, { userId: "u", appName: "a" })
				.build();
			const request = {
				model: "gemini-2.5-flash",
				contents: [
					{ role: "user", parts: [{ text: "first" }] },
					{ role: "user", parts: [{ text: "last-part" }] },
				],
			} as LlmRequest;
			await expect(runner.ask(request)).resolves.toBe("from-request");
			expect(captured[0]).toEqual({ parts: [{ text: "last-part" }] });
		});
	});
});
