import { type ComponentChild, render } from "preact";

export const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
	document.getElementById(id) as T | null;

export const esc = (s: unknown) =>
	String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const set = (id: string, text: string) => {
	const el = $(id);
	if (el) el.textContent = text;
};

export const fmt = (ms: number) => {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const ago = (iso: string) => {
	const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
	const units: [number, string][] = [[86400, "d"], [3600, "h"], [60, "m"]];
	for (const [n, u] of units) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
	return "just now";
};

const mounted = new WeakSet<Element>();

export function mount(vnode: ComponentChild, el: Element) {
	if (!mounted.has(el)) {
		el.replaceChildren();
		mounted.add(el);
	}
	render(vnode, el);
}

const loaded = new Map<string, string>();

export async function load<T>(url: string, render: (data: T) => void): Promise<boolean> {
	try {
		const res = await fetch(url);
		if (!res.ok) return false;
		const text = await res.text();
		if (loaded.get(url) === text) return true;
		loaded.set(url, text);
		render(JSON.parse(text) as T);
		return true;
	} catch {
		return false;
	}
}
