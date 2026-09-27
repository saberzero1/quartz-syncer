import { describeConnectionTest } from "src/git/GitRemoteUtils";
import type { ConnectionTestResult } from "src/git/types";

function result(
	over: Partial<ConnectionTestResult> = {},
): ConnectionTestResult {
	return {
		ok: true,
		readAccess: true,
		writeAccess: false,
		hasCredential: true,
		credentialVerified: true,
		...over,
	};
}

describe("describeConnectionTest", () => {
	it("reports write access", () => {
		expect(describeConnectionTest(result({ writeAccess: true }))).toBe(
			"Connected with write access.",
		);
	});

	it("warns that an unverified token cannot be trusted on an anonymous-read repository", () => {
		const message = describeConnectionTest(
			result({ credentialVerified: false }),
		);

		expect(message).toContain("could not be verified");
		expect(message).toContain("anonymous reads");
		expect(message).toContain("Publishing will fail");
	});

	it("reports a missing token separately from an unverified one", () => {
		const message = describeConnectionTest(
			result({ hasCredential: false, credentialVerified: false }),
		);

		expect(message).toContain("No token is configured");
		expect(message).not.toContain("could not be verified");
	});

	it("reports a verified token that simply lacks write access", () => {
		expect(describeConnectionTest(result())).toBe(
			"Connected read-only. The token is valid but lacks write access to this repository.",
		);
	});
});
