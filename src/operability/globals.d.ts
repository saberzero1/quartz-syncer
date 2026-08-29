import type { OperabilityFacade } from "./types";

declare global {
	interface Window {
		__QS__?: OperabilityFacade;
		__QS_RELOADING__?: boolean;
	}

	/**
	 * Compile-time flag injected by esbuild.
	 * `true` during `npm run dev` (watch) and `npm run build:dev` (development).
	 * `false` during `npm run build` (production).
	 */
	const __DEV__: boolean;
}

export {};
