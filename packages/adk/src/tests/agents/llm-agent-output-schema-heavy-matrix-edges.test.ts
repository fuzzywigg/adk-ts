import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

function makeAgent(
	overrides: Partial<ConstructorParameters<typeof LlmAgent>[0]> = {},
) {
	return new LlmAgent({
		name: "schema_agent",
		model: "gemini-2.5-flash",
		...overrides,
	});
}

function finalEvent(
	agent: LlmAgent,
	parts: Array<{ text?: string }>,
	author?: string,
) {
	const event = new Event({
		author: author ?? agent.name,
		content: { parts },
	});
	vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
	return event;
}

describe("LlmAgent maybeSaveOutputToState heavy matrix leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("author and final-response gates", () => {
		it.each([
			{ author: "other_agent", outputKey: "out", parts: [{ text: "x" }] },
			{ author: "user", outputKey: "out", parts: [{ text: "x" }] },
			{ author: "", outputKey: "out", parts: [{ text: "x" }] },
		])("skips when author=$author", ({ author, outputKey, parts }) => {
			const agent = makeAgent({ outputKey });
			const debug = vi.fn();
			(agent as any).logger = { debug, error: vi.fn(), warn: vi.fn() };
			const event = finalEvent(agent, parts, author);
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta?.[outputKey]).toBeUndefined();
			expect(debug).toHaveBeenCalled();
		});

		it("skips when response is not final", () => {
			const agent = makeAgent({ outputKey: "out" });
			const event = new Event({
				author: agent.name,
				content: { parts: [{ text: "x" }] },
			});
			vi.spyOn(event, "isFinalResponse").mockReturnValue(false);
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta?.out).toBeUndefined();
		});

		it("skips when content parts are missing", () => {
			const agent = makeAgent({ outputKey: "out" });
			const event = new Event({
				author: agent.name,
				content: {},
			});
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta?.out).toBeUndefined();
		});

		it("skips when outputKey is absent even on final response", () => {
			const agent = makeAgent();
			const event = finalEvent(agent, [{ text: "payload" }]);
			agent["maybeSaveOutputToState"](event);
			expect(Object.keys(event.actions.stateDelta ?? {})).toHaveLength(0);
		});
	});

	describe("multi-part join and whitespace matrix", () => {
		it.each([
			{
				label: "two-part json",
				parts: [{ text: '{"a":' }, { text: "42}" }],
				expected: '{"a":42}',
			},
			{
				label: "undefined text coalesced",
				parts: [{ text: undefined as any }, { text: "tail" }],
				expected: "tail",
			},
			{
				label: "three fragments",
				parts: [{ text: "hel" }, { text: "lo" }, { text: "!" }],
				expected: "hello!",
			},
		])("joins $label before write", ({ parts, expected }) => {
			const agent = makeAgent({ outputKey: "out" });
			const event = finalEvent(agent, parts);
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta?.out).toBe(expected);
		});

		it.each([
			"",
			"   ",
			"\n\t",
			" \n ",
		])("returns early on whitespace-only with schema: %j", async (whitespace) => {
			const { z } = await import("zod");
			const agent = makeAgent({
				outputKey: "out",
				outputSchema: z.object({ v: z.string() }),
			});
			const event = finalEvent(agent, [{ text: whitespace }]);
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta?.out).toBeUndefined();
		});
	});

	describe("schema validation matrix", () => {
		it("parses and stores validated object", async () => {
			const { z } = await import("zod");
			const agent = makeAgent({
				outputKey: "out",
				outputSchema: z.object({ n: z.number() }),
			});
			const event = finalEvent(agent, [{ text: '{"n":7}' }]);
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta?.out).toEqual({ n: 7 });
		});

		it.each([
			{
				label: "Error",
				throwValue: new Error("bad-json"),
				expected: "bad-json",
			},
			{ label: "string", throwValue: "plain-fail", expected: "plain-fail" },
			{ label: "number", throwValue: 99, expected: "99" },
		])("wraps $label schema failure", async ({ throwValue, expected }) => {
			const { z } = await import("zod");
			const agent = makeAgent({
				outputKey: "out",
				outputSchema: z.object({ x: z.string() }),
			});
			(agent as any).outputSchema = {
				parse: () => {
					throw throwValue;
				},
			};
			const event = finalEvent(agent, [{ text: '{"x":"y"}' }]);
			expect(() => agent["maybeSaveOutputToState"](event)).toThrow(
				new RegExp(`Output validation failed: ${expected}`),
			);
		});
	});

	describe("stateDelta initialization and falsy results", () => {
		it("initializes stateDelta when missing", () => {
			const agent = makeAgent({ outputKey: "out" });
			const event = finalEvent(agent, [{ text: "stored" }]);
			(event.actions as any).stateDelta = undefined;
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta).toBeDefined();
			expect(event.actions.stateDelta?.out).toBe("stored");
		});

		it("does not set state when joined result is empty without schema", () => {
			const agent = makeAgent({ outputKey: "out" });
			const event = finalEvent(agent, [{ text: "" }]);
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta?.out).toBeUndefined();
		});

		it("stores whitespace-only text without schema because it is truthy", () => {
			const agent = makeAgent({ outputKey: "out" });
			const event = finalEvent(agent, [{ text: "  " }]);
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta?.out).toBe("  ");
		});

		it("stores non-empty string without schema", () => {
			const agent = makeAgent({ outputKey: "out" });
			const event = finalEvent(agent, [{ text: "ok" }]);
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta?.out).toBe("ok");
		});
	});
});
