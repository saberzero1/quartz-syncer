declare module "localspace" {
	export interface LocalSpaceInstance {
		getItem<T = unknown>(key: string): Promise<T | null>;
		setItem<T = unknown>(key: string, value: T): Promise<void>;
		removeItem(key: string): Promise<void>;
		keys(): Promise<string[]>;
		iterate<T = unknown, R = void>(
			callback: (value: T, key: string) => R | Promise<R>,
		): Promise<void>;
	}

	const localspace: {
		INDEXEDDB: string;
		createInstance(options: {
			name: string;
			driver: string[];
		}): LocalSpaceInstance;
		dropInstance(options: { name: string }): Promise<void>;
	};

	export default localspace;
}
