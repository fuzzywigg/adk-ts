import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { CliModule } from "../cli/cli.module";
import { PrettyErrorFilter } from "../http/filters";
import { PrettyErrorFilter as DirectFilter } from "../http/filters/pretty-error.filter";

describe("AppModule leftover edges (TOKENMAXX adk-cli)", () => {
	it("imports only CliModule", () => {
		expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule)).toEqual([
			CliModule,
		]);
	});

	it("re-exports PrettyErrorFilter from the filters barrel", () => {
		expect(PrettyErrorFilter).toBe(DirectFilter);
	});
});
