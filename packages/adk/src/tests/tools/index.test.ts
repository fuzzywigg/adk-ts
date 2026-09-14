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
});
