import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalEvalSetsManager } from "../../evaluation/local-eval-sets-manager";

/**
 * Twelfth leftover: `code === "ENOENT"` is case-sensitive — `enoent`/`Enoent`
 * rethrow instead of empty/undefined/not-found mapping.
 */
describe("local-eval-sets ENOENT case-sensitivity twelfth leftover edges", () => {
	let basePath: string;
	let manager: LocalEvalSetsManager;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-enoent-case-"));
		manager = new LocalEvalSetsManager(basePath);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.rm(basePath, { recursive: true, force: true });
	});

	it.each([
		"enoent",
		"Enoent",
		"ENOENT ",
	])("getEvalSet rethrows code %j (not exact ENOENT)", async (code) => {
		vi.spyOn(fs, "readFile").mockRejectedValue(
			Object.assign(new Error("missing"), { code }),
		);
		await expect(manager.getEvalSet("app", "set-1")).rejects.toThrow("missing");
	});

	it("getEvalSet maps exact ENOENT to undefined (control)", async () => {
		vi.spyOn(fs, "readFile").mockRejectedValue(
			Object.assign(new Error("gone"), { code: "ENOENT" }),
		);
		await expect(manager.getEvalSet("app", "set-1")).resolves.toBeUndefined();
	});

	it.each([
		"enoent",
		"ENOENT ",
	])("deleteEvalSet rethrows code %j instead of not-found Error", async (code) => {
		vi.spyOn(fs, "unlink").mockRejectedValue(
			Object.assign(new Error("unlink-miss"), { code }),
		);
		await expect(manager.deleteEvalSet("app", "set-1")).rejects.toThrow(
			"unlink-miss",
		);
	});

	it("deleteEvalSet exact ENOENT becomes not-found Error (control)", async () => {
		vi.spyOn(fs, "unlink").mockRejectedValue(
			Object.assign(new Error("gone"), { code: "ENOENT" }),
		);
		await expect(manager.deleteEvalSet("app", "set-1")).rejects.toThrow(
			/Eval set `set-1` not found/,
		);
	});
});
