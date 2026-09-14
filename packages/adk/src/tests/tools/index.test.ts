import { describe, expect, it } from "vitest";
import * as tools from "../../tools";

describe("tools barrel exports", () => {
	it("exposes base tool constructors and createTool", () => {
		expect(typeof tools.BaseTool).toBe("function");
		expect(typeof tools.createTool).toBe("function");
		expect(typeof tools.FunctionTool).toBe("function");
		expect(typeof tools.createFunctionTool).toBe("function");
		expect(typeof tools.buildFunctionDeclaration).toBe("function");
		expect(typeof tools.ToolContext).toBe("function");
	});

	it("exposes common tools", () => {
		expect(typeof tools.AgentTool).toBe("function");
		expect(typeof tools.ExitLoopTool).toBe("function");
		expect(typeof tools.FileOperationsTool).toBe("function");
		expect(typeof tools.GetUserChoiceTool).toBe("function");
		expect(typeof tools.GoogleSearch).toBe("function");
		expect(typeof tools.HttpRequestTool).toBe("function");
		expect(typeof tools.LoadArtifactsTool).toBe("function");
		expect(typeof tools.LoadMemoryTool).toBe("function");
		expect(typeof tools.TransferToAgentTool).toBe("function");
		expect(typeof tools.UserInteractionTool).toBe("function");
	});

	it("exposes MCP toolset helpers from the tools barrel", () => {
		expect(typeof (tools as any).McpToolset).toBe("function");
		expect(typeof (tools as any).getMcpTools).toBe("function");
		expect(typeof (tools as any).convertMcpToolToBaseTool).toBe("function");
	});

	it("createTool from barrel builds a runnable BaseTool", async () => {
		const tool = tools.createTool({
			name: "barrel_add",
			description: "Adds via barrel",
			fn: () => ({ ok: true }),
		});
		expect(tool).toBeInstanceOf(tools.BaseTool);
		await expect(tool.runAsync({}, {} as any)).resolves.toEqual({ ok: true });
	});

	it("FunctionTool from barrel wraps a named function", async () => {
		function ping() {
			return "pong";
		}
		const tool = new tools.FunctionTool(ping, { description: "ping tool" });
		await expect(tool.runAsync({}, {} as any)).resolves.toBe("pong");
	});

	it("buildFunctionDeclaration from barrel reads function names", () => {
		function sample(a: string) {
			return a;
		}
		const declaration = tools.buildFunctionDeclaration(sample, {
			description: "sample",
		});
		expect(declaration.name).toBe("sample");
		expect(declaration.description).toBe("sample");
	});
});
