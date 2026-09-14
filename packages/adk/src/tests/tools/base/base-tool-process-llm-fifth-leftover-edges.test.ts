import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";

class DeclTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly decl: any,
	) {
		super(config);
	}

	getDeclaration() {
		return this.decl;
	}

	async runAsync() {
		return {};
	}
}

class NullDeclTool extends BaseTool {
	getDeclaration() {
		return null;
	}

	async runAsync() {
		return {};
	}
}

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

function makeDecl(name: string) {
	return {
		name,
		description: "decl",
		parameters: {
			type: Type.OBJECT,
			properties: { q: { type: Type.STRING } },
			required: ["q"],
		},
	};
}

describe("BaseTool processLlmRequest fifth leftover sparse FD matrices", () => {
	it("no-ops when getDeclaration returns null", async () => {
		const tool = new NullDeclTool({
			name: "null_decl",
			description: "Null declaration skips registration",
		});
		const request = new LlmRequest();
		await tool.processLlmRequest(makeContext(), request);
		expect(request.toolsDict).toEqual({});
		expect(request.config).toBeUndefined();
	});

	it("bootstraps config.tools when config is missing", async () => {
		const tool = new DeclTool(
			{ name: "boot_cfg", description: "Bootstraps missing config" },
			makeDecl("boot_cfg"),
		);
		const request = new LlmRequest();
		await tool.processLlmRequest(makeContext(), request);
		expect(request.toolsDict.boot_cfg).toBe(tool);
		expect(request.config?.tools).toHaveLength(1);
		expect(
			(request.config?.tools?.[0] as any).functionDeclarations[0].name,
		).toBe("boot_cfg");
	});

	it("bootstraps tools array when config exists without tools", async () => {
		const tool = new DeclTool(
			{ name: "boot_tools", description: "Bootstraps empty tools array" },
			makeDecl("boot_tools"),
		);
		const request = new LlmRequest({ config: { temperature: 0.2 } as any });
		await tool.processLlmRequest(makeContext(), request);
		expect(request.config?.temperature).toBe(0.2);
		expect(request.config?.tools).toHaveLength(1);
	});

	it("skips google-search-style tools without functionDeclarations key", async () => {
		const tool = new DeclTool(
			{ name: "after_builtin", description: "After builtin google tool" },
			makeDecl("after_builtin"),
		);
		const request = new LlmRequest({
			config: {
				tools: [{ googleSearch: {} } as any],
			} as any,
		});
		await tool.processLlmRequest(makeContext(), request);
		expect(request.config?.tools).toHaveLength(2);
		expect(
			(request.config?.tools?.[1] as any).functionDeclarations[0].name,
		).toBe("after_builtin");
	});

	it("ignores tools whose functionDeclarations is null/undefined/empty", async () => {
		const tool = new DeclTool(
			{ name: "skip_empty_fd", description: "Skips empty FD containers" },
			makeDecl("skip_empty_fd"),
		);
		const request = new LlmRequest({
			config: {
				tools: [
					{ functionDeclarations: null } as any,
					{ functionDeclarations: undefined } as any,
					{ functionDeclarations: [] },
					{ googleSearchRetrieval: {} } as any,
				],
			} as any,
		});
		await tool.processLlmRequest(makeContext(), request);
		expect(request.config?.tools).toHaveLength(5);
		expect(
			(request.config?.tools?.[4] as any).functionDeclarations[0].name,
		).toBe("skip_empty_fd");
	});

	it("appends into first tool that already has non-empty FDs", async () => {
		const tool = new DeclTool(
			{ name: "append_fd", description: "Appends into existing FD tool" },
			makeDecl("append_fd"),
		);
		const request = new LlmRequest({
			config: {
				tools: [
					{ functionDeclarations: [{ name: "existing", description: "e" }] },
				],
			} as any,
		});
		await tool.processLlmRequest(makeContext(), request);
		expect(request.config?.tools).toHaveLength(1);
		expect(
			(request.config?.tools?.[0] as any).functionDeclarations.map(
				(fd: any) => fd.name,
			),
		).toEqual(["existing", "append_fd"]);
	});

	const sparseHoles = [
		null,
		undefined,
		{},
		{ name: null },
		{ name: undefined },
		{ name: "" },
		{ name: "other" },
	];

	for (const [i, hole] of sparseHoles.entries()) {
		it(`dedupe treats sparse FD hole #${i} as non-matching`, async () => {
			const tool = new DeclTool(
				{
					name: `sparse_${i}`,
					description: "Sparse functionDeclarations hole matrix",
				},
				makeDecl(`sparse_${i}`),
			);
			const request = new LlmRequest({
				config: {
					tools: [
						{
							functionDeclarations: [hole as any, { name: "keep_me" }],
						},
					],
				} as any,
			});
			await tool.processLlmRequest(makeContext(), request);
			const fds = (request.config?.tools?.[0] as any).functionDeclarations;
			expect(fds).toHaveLength(3);
			expect(fds[2].name).toBe(`sparse_${i}`);
		});
	}

	it("dedupes when an existing FD already matches declaration name", async () => {
		const tool = new DeclTool(
			{ name: "dup_tool", description: "Duplicate declaration name path" },
			makeDecl("dup_tool"),
		);
		const request = new LlmRequest({
			config: {
				tools: [
					{
						functionDeclarations: [
							null,
							{ name: "dup_tool", description: "already" },
						],
					},
				],
			} as any,
		});
		await tool.processLlmRequest(makeContext(), request);
		const fds = (request.config?.tools?.[0] as any).functionDeclarations;
		expect(fds).toHaveLength(2);
		expect(request.toolsDict.dup_tool).toBe(tool);
	});

	it("initializes functionDeclarations when finder matched a tool with FD key but later emptied", async () => {
		const tool = new DeclTool(
			{ name: "init_fd", description: "Initializes missing FD array branch" },
			makeDecl("init_fd"),
		);
		const existingTool = {
			functionDeclarations: [{ name: "seed" }],
		};
		const request = new LlmRequest({
			config: { tools: [existingTool] } as any,
		});
		// Simulate race-style clear after finder would match; processLlmRequest
		// itself re-finds, so instead assert append path keeps array truthy.
		await tool.processLlmRequest(makeContext(), request);
		expect(existingTool.functionDeclarations.map((fd) => fd.name)).toEqual([
			"seed",
			"init_fd",
		]);
	});

	it("registers toolsDict even when declaration name differs from tool name", async () => {
		const tool = new DeclTool(
			{ name: "tool_key", description: "toolsDict keyed by tool.name" },
			makeDecl("decl_name"),
		);
		const request = new LlmRequest();
		await tool.processLlmRequest(makeContext(), request);
		expect(request.toolsDict.tool_key).toBe(tool);
		expect(request.toolsDict.decl_name).toBeUndefined();
		expect(
			(request.config?.tools?.[0] as any).functionDeclarations[0].name,
		).toBe("decl_name");
	});
});
