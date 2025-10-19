import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { Octokit as OctokitCore, type OctokitOptions } from "@octokit/core";

const BaseOctokit = OctokitCore.plugin(retry, throttling);

export class Octokit extends BaseOctokit {
	constructor(options: OctokitOptions) {
		super({
			throttle: {
				onRateLimit: (
					retryAfter: number,
					options,
					_octokitInstance,
				) => {
					console.warn(
						`Rate limit hit for ${options.method} ${options.url}, retrying in ${retryAfter}s`,
					);

					return true; // retry
				},
				onSecondaryRateLimit: (
					retryAfter: number,
					options,
					_octokitInstance,
				) => {
					console.warn(
						`Abuse limit hit for ${options.method} ${options.url}, retrying in ${retryAfter}s`,
					);

					return true; // retry
				},
			},
			...options,
		});
	}
}
