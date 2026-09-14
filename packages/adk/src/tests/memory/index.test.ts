import { describe, expect, it } from "vitest";
import {
	InMemoryMemoryService,
	VertexAiRagMemoryService,
} from "../../memory/index";

describe("memory barrel exports", () => {
	it("exports InMemoryMemoryService and VertexAiRagMemoryService", () => {
		expect(InMemoryMemoryService).toBeDefined();
		expect(VertexAiRagMemoryService).toBeDefined();
		expect(new InMemoryMemoryService()).toBeInstanceOf(InMemoryMemoryService);
		expect(new VertexAiRagMemoryService("corpus")).toBeInstanceOf(
			VertexAiRagMemoryService,
		);
	});

	it("constructed services expose the BaseMemoryService methods", () => {
		const memory = new InMemoryMemoryService();
		const rag = new VertexAiRagMemoryService("corpus");
		expect(typeof memory.addSessionToMemory).toBe("function");
		expect(typeof memory.searchMemory).toBe("function");
		expect(typeof rag.addSessionToMemory).toBe("function");
		expect(typeof rag.searchMemory).toBe("function");
	});
});
