import { statSync } from "node:fs";
import { join } from "node:path";

const POLL_MS = 1000;
const DIR = process.env.CONFIG_DIR ?? join(import.meta.dir, "data");

export type ConfigName = "profile" | "bot" | "content";
const NAMES: ConfigName[] = ["profile", "bot", "content"];

const files: Record<ConfigName, string> = {
	profile: join(DIR, "profile.json"),
	bot: join(DIR, "bot.json"),
	content: join(DIR, "content.json"),
};

type Entry = { value: any; stamp: string; version: number };
const state: Record<ConfigName, Entry> = {
	profile: { value: {}, stamp: "", version: 0 },
	bot: { value: {}, stamp: "", version: 0 },
	content: { value: {}, stamp: "", version: 0 },
};
const listeners = new Set<(name: ConfigName, value: any, prev: any) => void>();

function stampOf(path: string) {
	try {
		const s = statSync(path);
		return `${s.mtimeMs}:${s.size}:${s.ino}`;
	} catch {
		return "missing";
	}
}

async function load(name: ConfigName, initial = false) {
	const path = files[name];
	const stamp = stampOf(path);
	if (stamp === state[name].stamp) return;
	try {
		const value = JSON.parse(await Bun.file(path).text());
		const prev = state[name].value;
		state[name] = { value, stamp, version: state[name].version + 1 };
		if (!initial) {
			console.log(`[config] ${name}.json reloaded`);
			for (const fn of listeners) fn(name, value, prev);
		}
	} catch (err) {
		console.warn(`[config] ${path} is invalid, keeping previous version:`, (err as Error).message);
	}
}

export async function initConfig() {
	await Promise.all(NAMES.map((n) => load(n, true)));
	const g = globalThis as { configPoll?: ReturnType<typeof setInterval> };
	if (g.configPoll) clearInterval(g.configPoll);
	g.configPoll = setInterval(() => {
		for (const n of NAMES) load(n);
	}, POLL_MS);
}

export const getConfig = (name: ConfigName) => state[name].value;

export const configPath = (p: string) => (p.startsWith("/") ? p : join(DIR, p));
export const configVersion = (name: ConfigName) => state[name].version;

export function onConfigChange(fn: (name: ConfigName, value: any, prev: any) => void) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}
