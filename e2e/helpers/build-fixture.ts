// TODO: Implement when Publisher exists (Phase 1.7)
// This script will:
// 1. Copy fixture content + quartz.config.yaml to a Quartz v5 clone
// 2. Run `install-plugins` to generate .quartz/plugins/index.ts
// 3. Build the Quartz site
// 4. Move output to e2e/.output/<fixture>/
//
// Reference: ~/Repos/dev-mode/e2e/helpers/build-fixture.ts

export async function buildFixture(_fixtureName: string): Promise<void> {
	throw new Error("Not implemented — waiting for Phase 1.7 (Publisher)");
}
