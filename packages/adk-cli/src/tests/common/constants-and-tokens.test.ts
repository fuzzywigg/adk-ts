import { describe, expect, it } from "vitest";
import { DEFAULT_APP_NAME, USER_ID_PREFIX } from "../../common/constants";
import { TOKENS } from "../../common/tokens";

describe("constants", () => {
	it("exports session identity constants", () => {
		expect(USER_ID_PREFIX).toBe("user_");
		expect(DEFAULT_APP_NAME).toBe("adk-server");
	});
});

describe("TOKENS", () => {
	it("exports injection token keys", () => {
		expect(TOKENS.AGENTS_DIR).toBe("AGENTS_DIR");
		expect(TOKENS.QUIET).toBe("QUIET");
	});
});
