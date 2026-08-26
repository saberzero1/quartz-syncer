import type { EventBufferReader, QSEvent, QSEventType } from "./types";

export class EventBuffer implements EventBufferReader {
	private readonly capacity: number;
	private buffer: Array<QSEvent | null>;
	private head: number;
	private eventCount: number;
	private nextCursor: number;

	constructor(capacity = 500) {
		this.capacity = Math.max(0, Math.floor(capacity));
		this.buffer = new Array<QSEvent | null>(this.capacity).fill(null);
		this.head = 0;
		this.eventCount = 0;
		this.nextCursor = 1;
	}

	emit(type: QSEventType, payload: Record<string, unknown>): void {
		const cursor = this.nextCursor;
		this.nextCursor += 1;

		if (this.capacity === 0) {
			return;
		}

		const event: QSEvent = {
			cursor,
			timestamp: Date.now(),
			type,
			payload,
		};

		this.buffer[this.head] = event;
		this.head = (this.head + 1) % this.capacity;

		if (this.eventCount < this.capacity) {
			this.eventCount += 1;
		}
	}

	tail(n: number): QSEvent[] {
		if (this.eventCount === 0 || n <= 0) {
			return [];
		}

		const count = Math.min(n, this.eventCount);
		const startIndex = this.eventCount - count;
		const events: QSEvent[] = [];

		for (let index = startIndex; index < this.eventCount; index += 1) {
			const event = this.getAt(index);
			if (event) {
				events.push(event);
			}
		}

		return events;
	}

	since(
		cursor: number,
	): QSEvent[] | { error: "cursor_evicted"; oldestAvailable: number } {
		if (this.eventCount === 0) {
			return [];
		}

		const oldest = this.oldestCursor;
		if (oldest !== null && cursor < oldest - 1) {
			return { error: "cursor_evicted", oldestAvailable: oldest };
		}

		const events: QSEvent[] = [];
		for (let index = 0; index < this.eventCount; index += 1) {
			const event = this.getAt(index);
			if (event && event.cursor > cursor) {
				events.push(event);
			}
		}

		return events;
	}

	clear(): void {
		this.buffer = new Array<QSEvent | null>(this.capacity).fill(null);
		this.head = 0;
		this.eventCount = 0;
	}

	get length(): number {
		return this.eventCount;
	}

	get oldestCursor(): number | null {
		if (this.eventCount === 0) {
			return null;
		}

		const event = this.getAt(0);
		return event ? event.cursor : null;
	}

	get newestCursor(): number | null {
		if (this.eventCount === 0) {
			return null;
		}

		const event = this.getAt(this.eventCount - 1);
		return event ? event.cursor : null;
	}

	private getAt(logicalIndex: number): QSEvent | null {
		if (logicalIndex < 0 || logicalIndex >= this.eventCount) {
			return null;
		}

		if (this.eventCount < this.capacity) {
			const value = this.buffer[logicalIndex];
			return value ?? null;
		}

		const physicalIndex = (this.head + logicalIndex) % this.capacity;
		const value = this.buffer[physicalIndex];
		return value ?? null;
	}
}
