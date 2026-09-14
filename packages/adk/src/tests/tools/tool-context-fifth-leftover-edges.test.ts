import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { EventActions } from "../../events/event-actions";
import { ToolContext } from "../../tools/tool-context";

function makeInvocation(
	overrides: Partial<InvocationContext> = {},
): InvocationContext {
	return {
		appName: "app",
		userId: "user-1",
		session: { id: "session-1", state: {} },
		artifactService: undefined,
		memoryService: undefined,
		...overrides,
	} as InvocationContext;
}

describe("ToolContext fifth leftover — eventActions || / functionCallId / version 0 / null passthrough", () => {
	const falsyEventActions: Array<{ label: string; value: any }> = [
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty string", value: "" },
		{ label: "undefined", value: undefined },
	];

	for (const { label, value } of falsyEventActions) {
		it(`eventActions ${label} coalesces to fresh EventActions via ||`, () => {
			const context = new ToolContext(makeInvocation(), {
				eventActions: value,
			});
			expect(context.actions).toBeInstanceOf(EventActions);
			expect(context.actions).toBe(context.eventActions);
			expect(context.actions.stateDelta).toEqual({});
		});
	}

	it("truthy array eventActions is preserved (not replaced) via ||", () => {
		const weird = [] as any;
		weird.stateDelta = { fromArray: true };
		const context = new ToolContext(makeInvocation(), {
			eventActions: weird,
		});
		expect(context.actions).toBe(weird);
		expect((context.actions as any).stateDelta).toEqual({ fromArray: true });
	});

	const functionCallIds: Array<{ label: string; value: any }> = [
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty string", value: "" },
		{ label: "number 42", value: 42 },
		{ label: "object", value: { id: "x" } },
	];

	for (const { label, value } of functionCallIds) {
		it(`functionCallId assignment preserves ${label}`, () => {
			const context = new ToolContext(makeInvocation(), {
				functionCallId: value,
			});
			expect(context.functionCallId).toBe(value);
		});
	}

	it("saveArtifact records version 0 into artifactDelta", async () => {
		const saveArtifact = vi.fn().mockResolvedValue(0);
		const actions = new EventActions();
		const context = new ToolContext(
			makeInvocation({
				artifactService: { saveArtifact } as any,
			}),
			{ eventActions: actions },
		);
		await expect(
			context.saveArtifact("zero.txt", { text: "z" } as any),
		).resolves.toBe(0);
		expect(actions.artifactDelta["zero.txt"]).toBe(0);
		expect(saveArtifact).toHaveBeenCalledWith({
			appName: "app",
			userId: "user-1",
			sessionId: "session-1",
			filename: "zero.txt",
			artifact: { text: "z" },
		});
	});

	it("listArtifacts returns null payload passthrough from service", async () => {
		const listArtifactKeys = vi.fn().mockResolvedValue(null);
		const context = new ToolContext(
			makeInvocation({
				artifactService: { listArtifactKeys } as any,
			}),
		);
		await expect(context.listArtifacts()).resolves.toBeNull();
	});

	it("searchMemory returns null payload passthrough from service", async () => {
		const searchMemory = vi.fn().mockResolvedValue(null);
		const context = new ToolContext(
			makeInvocation({
				memoryService: { searchMemory } as any,
			}),
		);
		await expect(context.searchMemory("q")).resolves.toBeNull();
		expect(searchMemory).toHaveBeenCalledWith({
			query: "q",
			appName: "app",
			userId: "user-1",
		});
	});

	it("listArtifacts throw when artifactService missing", async () => {
		const context = new ToolContext(makeInvocation());
		await expect(context.listArtifacts()).rejects.toThrow(
			"Artifact service is not initialized.",
		);
	});

	it("searchMemory throw when memoryService missing", async () => {
		const context = new ToolContext(makeInvocation());
		await expect(context.searchMemory("q")).rejects.toThrow(
			"Memory service is not available.",
		);
	});

	it("actions getter aliases eventActions identity", () => {
		const actions = new EventActions({ escalate: true });
		const context = new ToolContext(makeInvocation(), {
			eventActions: actions,
		});
		expect(context.actions).toBe(actions);
		expect(context.actions.escalate).toBe(true);
	});

	it("omitted options still yields EventActions and undefined functionCallId", () => {
		const context = new ToolContext(makeInvocation());
		expect(context.functionCallId).toBeUndefined();
		expect(context.actions).toBeInstanceOf(EventActions);
	});
});
