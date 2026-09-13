import { describe, expect, it } from "vitest";
import { McpError, McpErrorType } from "../../../tools/mcp/types";

describe("McpErrorType", () => {
	it("exposes stable error type string values", () => {
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
			"connection failed",
			McpErrorType.CONNECTION_ERROR,
			original,
		);

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(McpError);
		expect(error.name).toBe("McpError");
		expect(error.message).toBe("connection failed");
		expect(error.type).toBe(McpErrorType.CONNECTION_ERROR);
		expect(error.originalError).toBe(original);
	});

	it("allows constructing without an originalError", () => {
		const error = new McpError("timeout", McpErrorType.TIMEOUT_ERROR);

		expect(error.originalError).toBeUndefined();
		expect(error.type).toBe(McpErrorType.TIMEOUT_ERROR);
	});
});
