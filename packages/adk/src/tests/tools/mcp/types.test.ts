import { describe, expect, it } from "vitest";
import { McpError, McpErrorType } from "../../../tools/mcp/types";

describe("McpErrorType", () => {
	it("exposes expected error type values", () => {
		expect(McpErrorType.CONNECTION_ERROR).toBe("connection_error");
		expect(McpErrorType.TOOL_EXECUTION_ERROR).toBe("tool_execution_error");
		expect(McpErrorType.RESOURCE_CLOSED_ERROR).toBe("resource_closed_error");
		expect(McpErrorType.TIMEOUT_ERROR).toBe("timeout_error");
		expect(McpErrorType.INVALID_SCHEMA_ERROR).toBe("invalid_schema_error");
		expect(McpErrorType.SAMPLING_ERROR).toBe("SAMPLING_ERROR");
		expect(McpErrorType.INVALID_REQUEST_ERROR).toBe("INVALID_REQUEST_ERROR");
	});
});

describe("McpError", () => {
	it("sets name, type, message, and optional originalError", () => {
		const original = new Error("root cause");
		const error = new McpError(
			"sampling failed",
			McpErrorType.SAMPLING_ERROR,
			original,
		);

		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("McpError");
		expect(error.message).toBe("sampling failed");
		expect(error.type).toBe(McpErrorType.SAMPLING_ERROR);
		expect(error.originalError).toBe(original);
	});

	it("allows constructing without originalError", () => {
		const error = new McpError(
			"bad request",
			McpErrorType.INVALID_REQUEST_ERROR,
		);

		expect(error.originalError).toBeUndefined();
		expect(error.type).toBe(McpErrorType.INVALID_REQUEST_ERROR);
	});
});
