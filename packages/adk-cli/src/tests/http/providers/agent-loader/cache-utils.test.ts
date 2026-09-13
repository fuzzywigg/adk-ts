import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CACHE_DIR,
	CacheUtils,
} from "../../../../http/providers/agent-loader/cache-utils";

describe("CacheUtils", () => {
	afterEach(() => {
		CacheUtils.cleanupAllCacheFiles(undefined, true);
	});

	it("creates temp file paths under the cache directory", () => {
		const utils = new CacheUtils(new Logger("CacheUtilsTest"), true);
		const root = mkdtempSync(join(tmpdir(), "adk-cli-cache-"));
		const path = utils.createTempFilePath(root);

		expect(path).toContain(join(root, CACHE_DIR));
		expect(path).toMatch(/agent-\d+\.cjs$/);
	});

	it("tracks cache files and cleans them up", () => {
		const logger = new Logger("CacheUtilsTest");
		const logSpy = vi.spyOn(logger, "log").mockImplementation(() => undefined);
		const utils = new CacheUtils(logger, false);
		const root = mkdtempSync(join(tmpdir(), "adk-cli-cache-root-"));
		const cacheDir = join(root, CACHE_DIR);
		mkdirSync(cacheDir, { recursive: true });
		const filePath = join(cacheDir, "agent-test.cjs");
		writeFileSync(filePath, "module.exports = {}");

		utils.trackCacheFile(filePath, root);
		expect(existsSync(filePath)).toBe(true);

		CacheUtils.cleanupAllCacheFiles(logger, false);

		expect(existsSync(filePath)).toBe(false);
		expect(existsSync(cacheDir)).toBe(false);
		expect(logSpy).toHaveBeenCalled();
	});

	it("creates distinct temp paths for successive calls", () => {
		const utils = new CacheUtils(new Logger("CacheUtilsTest"), true);
		const root = mkdtempSync(join(tmpdir(), "adk-cli-cache-uniq-"));
		const first = utils.createTempFilePath(root);
		const second = utils.createTempFilePath(root);
		expect(first).not.toBe(second);
	});

	it("skips cleanup logs when quiet", () => {
		const logger = new Logger("CacheUtilsTest");
		const logSpy = vi.spyOn(logger, "log").mockImplementation(() => undefined);
		const utils = new CacheUtils(logger, true);
		const root = mkdtempSync(join(tmpdir(), "adk-cli-cache-quiet-"));
		const cacheDir = join(root, CACHE_DIR);
		mkdirSync(cacheDir, { recursive: true });
		const filePath = join(cacheDir, "agent-quiet.cjs");
		writeFileSync(filePath, "module.exports = {}");
		utils.trackCacheFile(filePath, root);

		CacheUtils.cleanupAllCacheFiles(logger, true);
		expect(existsSync(filePath)).toBe(false);
		expect(logSpy).not.toHaveBeenCalled();
	});
});
