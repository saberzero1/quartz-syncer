import { expect } from "@wdio/globals";
import yaml from "yaml";

import type { FixtureManager } from "./fixture-manager";

const getNestedValue = (value: unknown, path: string): unknown => {
	return path.split(".").reduce<unknown>((current, key) => {
		if (current && typeof current === "object" && key in current) {
			return (current as Record<string, unknown>)[key];
		}
		return undefined;
	}, value);
};

export class RepoAssertions {
	constructor(private fixture: FixtureManager) {}

	fileExists(relativePath: string): void {
		expect(this.fixture.fileExists(relativePath)).toBe(true);
	}

	fileNotExists(relativePath: string): void {
		expect(this.fixture.fileExists(relativePath)).toBe(false);
	}

	fileContains(relativePath: string, expected: string): void {
		const content = this.fixture.readFile(relativePath);
		expect(content).toContain(expected);
	}

	configHasValue(key: string, value: unknown): void {
		const config = yaml.parse(this.fixture.readFile("quartz.config.yaml"));
		expect(getNestedValue(config, key)).toEqual(value);
	}

	async fileTreeUnchanged(beforeTree: string[]): Promise<void> {
		const afterTree = this.fixture.getFileTree();
		expect(afterTree).toEqual(beforeTree);
	}

	commentsPreserved(before: string, after: string): void {
		const commentsBefore = before
			.split("\n")
			.filter((line) => line.trim().startsWith("#"));
		const commentsAfter = after
			.split("\n")
			.filter((line) => line.trim().startsWith("#"));
		expect(commentsAfter).toEqual(commentsBefore);
	}

	onlyContentModified(
		beforeTree: string[],
		contentDir: string = "content",
	): void {
		const afterTree = this.fixture.getFileTree();
		const changedFiles = afterTree.filter(
			(file) => !beforeTree.includes(file),
		);
		for (const file of changedFiles) {
			expect(file.startsWith(`${contentDir}/`)).toBe(true);
		}
	}
}
