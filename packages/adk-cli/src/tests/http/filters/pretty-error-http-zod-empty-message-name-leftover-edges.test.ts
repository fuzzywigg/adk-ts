import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PrettyErrorFilter } from "../../../http/filters/pretty-error.filter";

function createHost(url = "/agents/demo") {
	const json = vi.fn();
	const status = vi.fn().mockReturnValue({ json });
	const host = {
		switchToHttp: () => ({
			getResponse: () => ({ status, json }),
			getRequest: () => ({ url }),
		}),
	} as unknown as ArgumentsHost;
	return { host, status, json };
}

/**
 * Leftover: falsy object message (false/0) falls through via ||;
 * empty "" stays empty (Nest mirrors both sides); Zod empty path → "(root)";
 * error.name || "Error"; prettify strips Error: /i.
 */
describe("PrettyErrorFilter http/zod empty message/name leftover edges", () => {
	it("falsy object message (false/0) falls through via || to exception.message", () => {
		const filter = new PrettyErrorFilter(false);
		const falsyFalse = createHost();
		filter.catch(
			new HttpException({ message: false }, HttpStatus.BAD_REQUEST),
			falsyFalse.host,
		);
		expect(falsyFalse.json.mock.calls[0][0].message).not.toBe("false");
		expect(falsyFalse.json.mock.calls[0][0].message.length).toBeGreaterThan(0);

		const falsyZero = createHost();
		filter.catch(
			new HttpException({ message: 0 }, HttpStatus.BAD_REQUEST),
			falsyZero.host,
		);
		expect(falsyZero.json.mock.calls[0][0].message).not.toBe("0");
		expect(falsyZero.json.mock.calls[0][0].message.length).toBeGreaterThan(0);
	});

	it('empty-string object message stays empty (Nest message also "")', () => {
		const filter = new PrettyErrorFilter(false);
		const { host, json } = createHost();
		filter.catch(
			new HttpException({ message: "" }, HttpStatus.BAD_REQUEST),
			host,
		);
		expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: "" }));
	});

	it("keeps non-empty object message and prettifies Error: prefix case-insensitively", () => {
		const filter = new PrettyErrorFilter(false);
		const keep = createHost();
		filter.catch(
			new HttpException({ message: "keep me" }, HttpStatus.BAD_REQUEST),
			keep.host,
		);
		expect(keep.json).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Keep me" }),
		);

		const prefixed = createHost();
		filter.catch(
			new HttpException("error: boom", HttpStatus.BAD_REQUEST),
			prefixed.host,
		);
		expect(prefixed.json).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Boom" }),
		);
	});

	it("Zod empty path uses (root) label", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, json } = createHost();
		const err = new z.ZodError([
			{
				code: "custom",
				path: [],
				message: "must be set",
			},
		]);
		filter.catch(err, host);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				details: expect.arrayContaining([expect.stringContaining("(root):")]),
			}),
		);
	});

	it("empty error.name falls back to Error via ||", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, json } = createHost();
		const error = new Error("mystery");
		error.name = "";
		filter.catch(error, host);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({ error: "Error" }),
		);
	});
});
