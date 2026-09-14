import { describe, expect, it } from "vitest";
import { EventActions } from "../../events/event-actions";

describe("EventActions fourth leftover — defaults / escalate / coalesces / compaction", () => {
	it("defaults all optional fields when constructed empty", () => {
		const actions = new EventActions();
		expect(actions.skipSummarization).toBeUndefined();
		expect(actions.stateDelta).toEqual({});
		expect(actions.artifactDelta).toEqual({});
		expect(actions.transferToAgent).toBeUndefined();
		expect(actions.escalate).toBeUndefined();
		expect(actions.requestedAuthConfigs).toBeUndefined();
		expect(actions.compaction).toBeUndefined();
		expect(actions.rewindBeforeInvocationId).toBeUndefined();
	});

	const escalateMatrix: Array<{
		label: string;
		escalate: boolean | undefined;
		expected: boolean | undefined;
	}> = [
		{ label: "undefined", escalate: undefined, expected: undefined },
		{ label: "false", escalate: false, expected: false },
		{ label: "true", escalate: true, expected: true },
	];

	for (const row of escalateMatrix) {
		it(`escalate=${row.label}`, () => {
			const actions = new EventActions({ escalate: row.escalate });
			expect(actions.escalate).toBe(row.expected);
			expect(actions.stateDelta).toEqual({});
			expect(actions.artifactDelta).toEqual({});
		});
	}

	const deltaCoalesce: Array<{
		label: string;
		stateDelta: any;
		artifactDelta: any;
		expectedState: Record<string, unknown>;
		expectedArtifact: Record<string, number>;
	}> = [
		{
			label: "omitted",
			stateDelta: undefined,
			artifactDelta: undefined,
			expectedState: {},
			expectedArtifact: {},
		},
		{
			label: "null",
			stateDelta: null,
			artifactDelta: null,
			expectedState: {},
			expectedArtifact: {},
		},
		{
			label: "falsey empty string coerced via || {}",
			stateDelta: "" as any,
			artifactDelta: 0 as any,
			expectedState: {},
			expectedArtifact: {},
		},
		{
			label: "empty objects",
			stateDelta: {},
			artifactDelta: {},
			expectedState: {},
			expectedArtifact: {},
		},
		{
			label: "populated",
			stateDelta: { k: "v", n: 0 },
			artifactDelta: { "a.txt": 0, "b.bin": 3 },
			expectedState: { k: "v", n: 0 },
			expectedArtifact: { "a.txt": 0, "b.bin": 3 },
		},
	];

	for (const row of deltaCoalesce) {
		it(`stateDelta/artifactDelta coalesce: ${row.label}`, () => {
			const actions = new EventActions({
				stateDelta: row.stateDelta,
				artifactDelta: row.artifactDelta,
			});
			expect(actions.stateDelta).toEqual(row.expectedState);
			expect(actions.artifactDelta).toEqual(row.expectedArtifact);
		});
	}

	const authConfigs: Array<{ label: string; value: any }> = [
		{ label: "undefined", value: undefined },
		{ label: "empty object", value: {} },
		{ label: "single tool", value: { search: { scheme: "oauth2" } } },
		{
			label: "multi tool",
			value: {
				a: { scheme: "api_key" },
				b: { scheme: "bearer", scopes: [] },
			},
		},
	];

	for (const row of authConfigs) {
		it(`requestedAuthConfigs: ${row.label}`, () => {
			const actions = new EventActions({
				requestedAuthConfigs: row.value,
			});
			expect(actions.requestedAuthConfigs).toEqual(row.value);
		});
	}

	const compactionFixtures: Array<{
		label: string;
		compaction: any;
	}> = [
		{ label: "undefined", compaction: undefined },
		{
			label: "minimal timestamps",
			compaction: {
				startTimestamp: 0,
				endTimestamp: 0,
				compactedContent: { role: "model", parts: [] },
			},
		},
		{
			label: "negative range",
			compaction: {
				startTimestamp: -10,
				endTimestamp: -1,
				compactedContent: {
					role: "model",
					parts: [{ text: "prior" }],
				},
			},
		},
		{
			label: "with text summary",
			compaction: {
				startTimestamp: 100,
				endTimestamp: 200,
				compactedContent: {
					role: "model",
					parts: [{ text: "sum" }],
				},
			},
		},
	];

	for (const row of compactionFixtures) {
		it(`compaction metadata: ${row.label}`, () => {
			const actions = new EventActions({ compaction: row.compaction });
			expect(actions.compaction).toEqual(row.compaction);
		});
	}

	const rewindIds = [undefined, "", "inv-0", "inv-rewind", "a.b.c"];

	for (const id of rewindIds) {
		it(`rewindBeforeInvocationId=${JSON.stringify(id)}`, () => {
			const actions = new EventActions({
				rewindBeforeInvocationId: id,
			});
			expect(actions.rewindBeforeInvocationId).toBe(id);
		});
	}

	it("combines escalate, deltas, auth, compaction, and rewind", () => {
		const actions = new EventActions({
			escalate: true,
			skipSummarization: false,
			stateDelta: { step: 1 },
			artifactDelta: { "out.txt": 2 },
			transferToAgent: "boss",
			requestedAuthConfigs: { tool: { scheme: "oauth2" } },
			compaction: {
				startTimestamp: 1,
				endTimestamp: 9,
				compactedContent: { role: "model", parts: [{ text: "c" }] },
			},
			rewindBeforeInvocationId: "inv-before",
		});
		expect(actions.escalate).toBe(true);
		expect(actions.skipSummarization).toBe(false);
		expect(actions.stateDelta).toEqual({ step: 1 });
		expect(actions.artifactDelta).toEqual({ "out.txt": 2 });
		expect(actions.transferToAgent).toBe("boss");
		expect(actions.requestedAuthConfigs).toEqual({
			tool: { scheme: "oauth2" },
		});
		expect(actions.compaction?.endTimestamp).toBe(9);
		expect(actions.rewindBeforeInvocationId).toBe("inv-before");
	});

	it("preserves delta object identity (no deep clone)", () => {
		const stateDelta = { a: 1 };
		const artifactDelta = { f: 0 };
		const actions = new EventActions({ stateDelta, artifactDelta });
		stateDelta.a = 99;
		artifactDelta.f = 7;
		expect(actions.stateDelta.a).toBe(99);
		expect(actions.artifactDelta.f).toBe(7);
	});
});
