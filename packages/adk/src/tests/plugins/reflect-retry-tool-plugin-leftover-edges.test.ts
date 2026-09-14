import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import {
	REFLECT_AND_RETRY_RESPONSE_TYPE,
	ReflectAndRetryToolPlugin,
} from "../../plugins/reflect-retry-tool-plugin";
import type { BaseTool } from "../../tools/base/base-tool";
import { ToolContext } from "../../tools/tool-context";

function makeTool(name = "flaky_tool"): BaseTool {
	return { name } as BaseTool;
}

function makeToolContext(invocationId = "inv-1"): ToolContext {
	return new ToolContext({
		invocationId,
		agent: { name: "agent" },
		session: { id: "sess", state: {} },
		appName: "app",
		userId: "user",
	} as unknown as InvocationContext);
}

describe("ReflectAndRetryToolPlugin leftover edges", () => {
	it("uses ToolError when exceeded with a nameless object error", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: false,
		});

		const response = await plugin.onToolErrorCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext: makeToolContext(),
			error: {} as any,
		});

		expect(response?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(response?.error_type).toBe("ToolError");
		expect(response?.retry_count).toBe(0);
	});

	it("uses ToolError when exceeded with a null error", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: false,
		});

		const response = await plugin.onToolErrorCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext: makeToolContext(),
			error: null as any,
		});

		expect(response?.error_type).toBe("ToolError");
		expect(response?.error_details).toBe("null");
	});

	it("uses ToolError when exceeded with { message } and no name", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 1,
			throwExceptionIfRetryExceeded: false,
		});
		const tool = makeTool("writer");
		const toolContext = makeToolContext();

		await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: { message: "first" } as any,
		});

		const exceeded = await plugin.onToolErrorCallback({
			tool,
			toolArgs: { path: "/tmp/x" },
			toolContext,
			error: { message: "x" } as any,
		});

		expect(exceeded?.error_type).toBe("ToolError");
		expect(exceeded?.retry_count).toBe(1);
		expect(exceeded?.reflection_guidance).toContain("retry limit exceeded");
		expect(exceeded?.error_details).toBe("[object Object]");
	});

	it("preserves empty Error.name when exceeded (?? only covers nullish)", async () => {
		class EmptyNameError extends Error {
			constructor(message: string) {
				super(message);
				this.name = "";
			}
		}

		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: false,
		});

		const response = await plugin.onToolErrorCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext: makeToolContext(),
			error: new EmptyNameError("blank-name"),
		});

		expect(response?.error_type).toBe("");
		expect(response?.error_details).toContain("blank-name");
	});

	it("uses ToolError when Error.name is forced undefined", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: false,
		});
		const error = new Error("nameless");
		Object.defineProperty(error, "name", { value: undefined });

		const response = await plugin.onToolErrorCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext: makeToolContext(),
			error,
		});

		expect(response?.error_type).toBe("ToolError");
	});
});
