export type TestContext = {
	timeout: (ms: number) => void;
};

type Hook = (fn: () => void | Promise<void>) => void;
type TestFn = (
	name: string,
	fn: (this: TestContext) => void | Promise<void>,
) => void;
type SuiteFn = (name: string, fn: () => void) => void;

const globals = globalThis as unknown as {
	describe: SuiteFn;
	it: TestFn;
	before: Hook;
	after: Hook;
	beforeEach: Hook;
};

export const { describe, it, before, after, beforeEach } = globals;
