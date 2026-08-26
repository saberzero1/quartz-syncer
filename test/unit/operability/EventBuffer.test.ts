import { EventBuffer } from "src/operability/EventBuffer";

describe("EventBuffer", () => {
	describe("empty buffer", () => {
		it("tail(n) returns empty", () => {
			const buf = new EventBuffer();
			expect(buf.tail(5)).toEqual([]);
		});

		it("since(0) returns empty", () => {
			const buf = new EventBuffer();
			expect(buf.since(0)).toEqual([]);
		});

		it("length is 0", () => {
			const buf = new EventBuffer();
			expect(buf.length).toBe(0);
		});

		it("oldestCursor is null", () => {
			const buf = new EventBuffer();
			expect(buf.oldestCursor).toBeNull();
		});

		it("newestCursor is null", () => {
			const buf = new EventBuffer();
			expect(buf.newestCursor).toBeNull();
		});
	});

	describe("single event", () => {
		it("tail(1) returns it", () => {
			const buf = new EventBuffer();
			buf.emit("plugin.loaded", { v: 1 });
			const events = buf.tail(1);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("plugin.loaded");
			expect(events[0].payload).toEqual({ v: 1 });
		});

		it("length is 1", () => {
			const buf = new EventBuffer();
			buf.emit("plugin.loaded", {});
			expect(buf.length).toBe(1);
		});

		it("cursors match", () => {
			const buf = new EventBuffer();
			buf.emit("plugin.loaded", {});
			expect(buf.oldestCursor).toBe(1);
			expect(buf.newestCursor).toBe(1);
		});
	});

	describe("multiple events", () => {
		it("tail(2) returns last 2", () => {
			const buf = new EventBuffer();
			buf.emit("plugin.loaded", { n: 1 });
			buf.emit("engine.started", { n: 2 });
			buf.emit("publish.started", { n: 3 });
			const events = buf.tail(2);
			expect(events).toHaveLength(2);
			expect(events[0].payload).toEqual({ n: 2 });
			expect(events[1].payload).toEqual({ n: 3 });
		});

		it("tail(10) returns all when fewer exist", () => {
			const buf = new EventBuffer();
			buf.emit("plugin.loaded", {});
			buf.emit("engine.started", {});
			buf.emit("publish.started", {});
			expect(buf.tail(10)).toHaveLength(3);
		});
	});

	describe("since", () => {
		it("returns events after the given cursor (exclusive)", () => {
			const buf = new EventBuffer();
			buf.emit("plugin.loaded", { n: 1 });
			buf.emit("engine.started", { n: 2 });
			buf.emit("publish.started", { n: 3 });
			const result = buf.since(1);
			expect(Array.isArray(result)).toBe(true);
			if (!Array.isArray(result)) return;
			expect(result).toHaveLength(2);
			expect(result[0].type).toBe("engine.started");
			expect(result[1].type).toBe("publish.started");
		});

		it("since(0) returns all events", () => {
			const buf = new EventBuffer();
			buf.emit("plugin.loaded", {});
			buf.emit("engine.started", {});
			const result = buf.since(0);
			expect(Array.isArray(result)).toBe(true);
			if (!Array.isArray(result)) return;
			expect(result).toHaveLength(2);
		});
	});

	describe("ring buffer wrap", () => {
		it("retains only last capacity events", () => {
			const capacity = 5;
			const buf = new EventBuffer(capacity);
			for (let i = 0; i < capacity + 5; i += 1) {
				buf.emit("publish.started", { i });
			}
			expect(buf.length).toBe(capacity);
			const events = buf.tail(capacity);
			expect(events[0].payload).toEqual({ i: 5 });
			expect(events[capacity - 1].payload).toEqual({ i: 9 });
		});
	});

	describe("cursor eviction", () => {
		it("since(evictedCursor) returns error with oldestAvailable", () => {
			const buf = new EventBuffer(3);
			for (let i = 0; i < 8; i += 1) {
				buf.emit("publish.started", { i });
			}
			const result = buf.since(4);
			expect(result).toEqual({
				error: "cursor_evicted",
				oldestAvailable: 6,
			});
		});
	});

	it("cursor monotonicity: cursors always increase", () => {
		const buf = new EventBuffer();
		buf.emit("plugin.loaded", {});
		buf.emit("engine.started", {});
		buf.emit("publish.started", {});
		const events = buf.tail(3);
		expect(events[0].cursor).toBeLessThan(events[1].cursor);
		expect(events[1].cursor).toBeLessThan(events[2].cursor);
	});

	describe("clear", () => {
		it("empties buffer", () => {
			const buf = new EventBuffer();
			buf.emit("plugin.loaded", {});
			buf.emit("engine.started", {});
			buf.clear();
			expect(buf.length).toBe(0);
			expect(buf.oldestCursor).toBeNull();
			expect(buf.newestCursor).toBeNull();
		});

		it("cursor continues incrementing after clear", () => {
			const buf = new EventBuffer();
			buf.emit("plugin.loaded", {});
			buf.emit("engine.started", {});
			const cursorBefore = buf.newestCursor!;
			buf.clear();
			buf.emit("publish.started", {});
			expect(buf.newestCursor).toBeGreaterThan(cursorBefore);
		});
	});

	describe("zero capacity", () => {
		it("tail(n) returns empty and length is 0", () => {
			const buf = new EventBuffer(0);
			buf.emit("plugin.loaded", {});
			buf.emit("engine.started", {});
			expect(buf.tail(10)).toEqual([]);
			expect(buf.length).toBe(0);
		});
	});

	it("tail(0) returns empty array", () => {
		const buf = new EventBuffer();
		buf.emit("plugin.loaded", {});
		expect(buf.tail(0)).toEqual([]);
	});

	it("tail(-1) returns empty array", () => {
		const buf = new EventBuffer();
		buf.emit("plugin.loaded", {});
		expect(buf.tail(-1)).toEqual([]);
	});

	it("event structure has correct fields", () => {
		const buf = new EventBuffer();
		buf.emit("error.occurred", { msg: "test" });
		const event = buf.tail(1)[0];
		expect(event.cursor).toBe(1);
		expect(typeof event.timestamp).toBe("number");
		expect(event.type).toBe("error.occurred");
		expect(event.payload).toEqual({ msg: "test" });
	});
});
