import type QuartzSyncer from "src/main";
import type {
	OperabilityFacade as IOperabilityFacade,
	Action,
	ActionResult,
	CheckName,
	CheckResult,
	OperabilitySnapshot,
} from "./types";
import { EventBuffer } from "./EventBuffer";
import { assembleSnapshot } from "./OperabilitySnapshot";
import { ActionRegistry } from "./ActionRegistry";
import { runAssertion } from "./Assertions";
import { PublicationService } from "src/services/PublicationService";
import { OnboardingService } from "src/services/OnboardingService";
import type { Publisher } from "src/publisher/Publisher";

export class OperabilityFacadeImpl implements IOperabilityFacade {
	private readonly eventBuffer: EventBuffer;
	private actionRegistry: ActionRegistry;
	private shuttingDown = false;
	private publicationService: PublicationService | null = null;
	private publicationServicePublisher: Publisher | null = null;
	private onboardingService: OnboardingService | null = null;

	constructor(
		private plugin: QuartzSyncer,
		eventBuffer: EventBuffer,
	) {
		this.eventBuffer = eventBuffer;
		this.actionRegistry = new ActionRegistry(
			plugin,
			() => this.getPublicationService(),
			() => this.getOnboardingService(),
			() => plugin.getPublicationCenterManager(),
			() => plugin.getQuartzHubManager(),
		);

		this.eventBuffer.emit("plugin.loaded", {
			version: plugin.appVersion ?? plugin.manifest.version,
		});
	}

	snapshot(): OperabilitySnapshot {
		const snapshot = assembleSnapshot(this.plugin, this.eventBuffer);
		const publishStatus = this.actionRegistry.getPublishStatusSummary();
		const errors = this.getErrorSummary();

		return {
			...snapshot,
			publishStatus,
			errors,
		};
	}

	get events() {
		return this.eventBuffer;
	}

	async act(action: Action): Promise<ActionResult> {
		if (this.shuttingDown) {
			return { success: false, error: "Plugin is shutting down" };
		}

		this.emitActionStart(action);
		const result = await this.actionRegistry.dispatch(action);
		this.emitActionResult(action, result);
		return result;
	}

	assert(check: CheckName, params?: Record<string, unknown>): CheckResult {
		return runAssertion(check, params, this.plugin, this.eventBuffer);
	}

	async waitFor(
		condition: CheckName,
		params?: Record<string, unknown>,
		timeoutMs?: number,
	): Promise<CheckResult> {
		const timeout = Math.min(timeoutMs ?? 10_000, 60_000);
		const interval = 250;
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const result = this.assert(condition, params);
			if (result.pass) return result;
			await new Promise((resolve) =>
				window.setTimeout(resolve, interval),
			);
		}

		return {
			pass: false,
			details: {
				reason: "timeout",
				lastCheck: this.assert(condition, params).details,
			},
		};
	}

	async reloadSelf(): Promise<ActionResult> {
		if (this.shuttingDown) {
			return { success: false, error: "Plugin is shutting down" };
		}

		return this.actionRegistry.dispatch({
			name: "plugin.reload",
			params: { confirm: true },
		});
	}

	shutdown(): void {
		this.shuttingDown = true;
		this.eventBuffer.emit("plugin.unloading", {});
	}

	private getPublicationService(): PublicationService | null {
		const publisher = this.plugin.getPublisher();

		if (!publisher) {
			this.publicationService = null;
			this.publicationServicePublisher = null;
			return null;
		}

		if (
			!this.publicationService ||
			this.publicationServicePublisher !== publisher
		) {
			this.publicationService = new PublicationService(publisher);
			this.publicationServicePublisher = publisher;
		}

		return this.publicationService;
	}

	private getOnboardingService(): OnboardingService | null {
		if (!this.onboardingService) {
			this.onboardingService = new OnboardingService(this.plugin);
		}

		return this.onboardingService;
	}

	private emitActionStart(action: Action): void {
		switch (action.name) {
			case "pub.publish":
				this.eventBuffer.emit("publish.started", {
					message: action.params.message ?? null,
				});
				break;
			case "pub.delete":
				this.eventBuffer.emit("delete.started", {});
				break;
			default:
				break;
		}
	}

	private emitActionResult(action: Action, result: ActionResult): void {
		if (!result.success) {
			this.eventBuffer.emit("error.occurred", {
				action: action.name,
				error: result.error ?? "Unknown error",
			});
		}

		switch (action.name) {
			case "status.refresh":
				if (result.success) {
					this.eventBuffer.emit("status.refreshed", {
						summary: this.actionRegistry.getPublishStatusSummary(),
					});
				}
				break;
			case "connection.test":
				this.eventBuffer.emit("connection.tested", {
					ok: result.success,
					...(result.data && typeof result.data === "object"
						? (result.data as Record<string, unknown>)
						: {}),
				});
				break;
			case "settings.set":
				if (result.success) {
					this.eventBuffer.emit("settings.changed", {
						key: action.params.key,
					});
				}
				break;
			case "pub.publish":
				this.eventBuffer.emit(
					result.success ? "publish.completed" : "publish.failed",
					{
						result: result.data ?? null,
						error: result.error ?? null,
					},
				);
				break;
			case "pub.delete":
				this.eventBuffer.emit(
					result.success ? "delete.completed" : "delete.failed",
					{
						result: result.data ?? null,
						error: result.error ?? null,
					},
				);
				break;
			default:
				break;
		}
	}

	private getErrorSummary(): { count: number; latest: string | null } {
		const events = this.eventBuffer.tail(this.eventBuffer.length);
		const errors = events.filter(
			(event) => event.type === "error.occurred",
		);
		const latest = errors.length
			? describeErrorPayload(errors[errors.length - 1]?.payload)
			: null;

		return {
			count: errors.length,
			latest,
		};
	}
}

function describeErrorPayload(
	payload: Record<string, unknown> | undefined,
): string {
	if (!payload) return "Unknown error";
	const message =
		typeof payload.message === "string"
			? payload.message
			: typeof payload.error === "string"
				? payload.error
				: null;
	if (message) return message;

	try {
		return JSON.stringify(payload);
	} catch {
		return "Unknown error";
	}
}
