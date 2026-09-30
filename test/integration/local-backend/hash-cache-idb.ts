// A narrow IndexedDB boundary fake; the production IndexedDBStore still opens,
// serializes and closes independent connections on every tree build.
export function createHashCacheDatabase() {
	const databases = new Map<string, Map<string, unknown>>();
	function request(result: unknown) {
		const pending: { result: unknown; onsuccess?: () => void } = { result };
		queueMicrotask(() => pending.onsuccess?.());
		return pending;
	}
	return {
		databases,
		open(name: string) {
			let values = databases.get(name);
			if (!values) {
				values = new Map();
				databases.set(name, values);
			}
			const stored = values;
			return request({
				objectStoreNames: { contains: () => true },
				close() {},
				transaction: () => ({
					objectStore: () => ({
						get: (key: string) =>
							request(structuredClone(stored.get(key))),
						put: (value: unknown, key: string) => {
							stored.set(key, structuredClone(value));
							return request(key);
						},
					}),
				}),
			});
		},
	};
}
