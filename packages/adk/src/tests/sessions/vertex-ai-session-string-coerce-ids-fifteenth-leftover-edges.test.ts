import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

function createService() {
	const asyncRequest = vi.fn();
	const service = new VertexAiSessionService({ agentEngineId: "9" });
	(service as any).getApiClient = () => ({ async_request: asyncRequest });
	return { service, asyncRequest };
}

function mockCreateSuccess(asyncRequest: ReturnType<typeof vi.fn>) {
	asyncRequest
		.mockResolvedValueOnce({
			name: "projects/p/locations/l/reasoningEngines/9/sessions/s1/operations/op1",
		})
		.mockResolvedValueOnce({ done: true })
		.mockResolvedValueOnce({
			name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
			updateTime: "2024-01-01T00:00:00.000Z",
			sessionState: {},
		});
}

/**
 * Fifteenth leftover: returned Session uses String(appName)/String(userId) —
 * numeric ids are coerced to strings.
 */
describe("vertex-ai session string coerce ids fifteenth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("createSession coerces numeric appName/userId via String()", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		mockCreateSuccess(asyncRequest);
		const session = await service.createSession(99 as any, 7 as any, {});
		expect(session.appName).toBe("99");
		expect(session.userId).toBe("7");
		expect(typeof session.appName).toBe("string");
		expect(typeof session.userId).toBe("string");
	});

	it("getSession also coerces numeric ids via String()", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({ httpHeaders: {} });

		const session = await service.getSession(42 as any, 3 as any, "s");
		expect(session?.appName).toBe("42");
		expect(session?.userId).toBe("3");
	});
});
