import { describe, expect, it, vi } from "vitest";
import { McpClientService } from "../../../tools/mcp/client";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

/**
 * Fifteenth leftover: `isConnected()` is `!!this.client && !this.isClosing`.
 * Missing client / closing both yield false; set client with isClosing false
 * yields true.
 */
describe("mcp-client isConnected truthiness fifteenth leftover", () => {
	function service() {
		return new McpClientService({
			name: "isconnected-15",
			description: "isConnected leftover",
			transport: {
				mode: "stdio",
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
		});
	}

	it("false when client is null (default)", () => {
		const s = service();
		expect(s.isConnected()).toBe(false);
	});

	it("false when client is set but isClosing is true", () => {
		const s = service();
		(s as any).client = { close: vi.fn() };
		(s as any).isClosing = true;
		expect(s.isConnected()).toBe(false);
	});

	it("true when client is set and isClosing is false", () => {
		const s = service();
		(s as any).client = { close: vi.fn() };
		(s as any).isClosing = false;
		expect(s.isConnected()).toBe(true);
	});

	it.each([
		0,
		"",
		false,
		null,
	] as const)("!!client coerces falsy client %j to disconnected", (client) => {
		const s = service();
		(s as any).client = client;
		(s as any).isClosing = false;
		expect(s.isConnected()).toBe(false);
	});
});
