import { spotify } from "./logging";

export type Track = {
	id: string;
	name: string;
	artists: { name: string; url: string }[];
	album: string;
	art: string | null;
	url: string;
	durationMs: number;
	previewUrl: string | null;
};

export type SpotifyState =
	| { configured: false }
	| { configured: true; track: null }
	| {
		configured: true;
		track: Track;
		playing: boolean;
		progressMs: number | null;
		playedAt: string | null;
		fetchedAt: number;
	};

const API = "https://api.spotify.com/v1";
const TTL = 10000;

let token: { value: string; exp: number } | null = null;
let cache: { at: number; data: SpotifyState } | null = null;
const PREVIEW_TTL = 10 * 60000;
const previewUrls = new Map<string, { url: string | null; at: number }>();
const previewCache = {
	has: (id: string) => {
		const e = previewUrls.get(id);
		return Boolean(e && Date.now() - e.at < PREVIEW_TTL);
	},
	get: (id: string) => previewUrls.get(id)?.url ?? null,
	set: (id: string, url: string | null) => {
		previewUrls.set(id, { url, at: Date.now() });
		if (previewUrls.size > 200) previewUrls.delete(previewUrls.keys().next().value!);
	},
};

const env = () => ({
	id: process.env.SPOTIFY_CLIENT_ID,
	secret: process.env.SPOTIFY_CLIENT_SECRET,
	refresh: process.env.SPOTIFY_REFRESH_TOKEN,
});

async function accessToken() {
	if (token && Date.now() < token.exp) return token.value;
	const { id, secret, refresh } = env();
	const res = await fetch("https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh! }),
	});
	const json: any = await res.json();
	if (!res.ok) throw new Error(json.error_description ?? json.error ?? res.statusText);
	token = { value: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 };
	return token.value;
}

async function api(path: string) {
	const res = await fetch(API + path, {
		headers: { Authorization: `Bearer ${await accessToken()}` },
		signal: AbortSignal.timeout(5000),
	});
	if (res.status === 204) return null;
	if (!res.ok) throw new Error(`spotify ${path}: ${res.status}`);
	return res.json() as Promise<any>;
}

async function findPreview(t: any): Promise<string | null> {
	if (previewCache.has(t.id)) return previewCache.get(t.id);
	if (t.preview_url) {
		previewCache.set(t.id, t.preview_url);
		return t.preview_url;
	}
	const norm = (s: string) =>
		(s ?? "").toLowerCase().replace(/\(.*?\)|\[.*?\]|\s-\s.*$/g, "").replace(/[^\p{L}\p{N}]/gu, "");
	const name = norm(t.name);
	const artist = norm(t.artists?.[0]?.name ?? "");
	const pick = <T>(list: T[], title: (r: T) => string, by: (r: T) => string) =>
		list.find((r) => norm(title(r)) === name && norm(by(r)).includes(artist)) ??
		list.find((r) => norm(title(r)) === name);

	const deezer = async () => {
		const q = t.external_ids?.isrc ? `isrc:${t.external_ids.isrc}` : null;
		if (q) {
			const r: any = await (await fetch(`https://api.deezer.com/2.0/track/${q}`, { signal: AbortSignal.timeout(4000) })).json();
			if (r?.preview) return r.preview as string;
		}
		const term = `artist:"${t.artists?.[0]?.name ?? ""}" track:"${t.name}"`;
		const res: any = await (
			await fetch(`https://api.deezer.com/search?${new URLSearchParams({ q: term, limit: "10" })}`, {
				signal: AbortSignal.timeout(4000),
			})
		).json();
		const list = res.data ?? [];
		return (
			pick<any>(list, (r) => r.title, (r) => r.artist?.name)?.preview ??
			pick<any>(list, (r) => r.title_short, (r) => r.artist?.name)?.preview ??
			null
		);
	};

	const itunes = async () => {
		const term = `${t.artists?.[0]?.name ?? ""} ${t.name}`;
		const res: any = await (
			await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term, entity: "song", limit: "10" })}`, {
				signal: AbortSignal.timeout(4000),
			})
		).json();
		return pick<any>(res.results ?? [], (r) => r.trackName, (r) => r.artistName)?.previewUrl ?? null;
	};

	let url: string | null = null;
	for (const source of [deezer, itunes]) {
		try {
			url = await source();
			if (url) break;
		} catch {}
	}
	previewCache.set(t.id, url);
	return url;
}

async function previewPath(t: any): Promise<string | null> {
	const url = await findPreview(t);
	if (!url) return null;
	const src = /itunes/.test(url) ? "it" : /dzcdn|deezer/.test(url) ? "dz" : "sp";
	return `/api/spotify/preview/${encodeURIComponent(t.id)}?src=${src}`;
}

async function toTrack(t: any): Promise<Track> {
	return {
		id: t.id,
		name: t.name,
		artists: (t.artists ?? []).map((a: any) => ({ name: a.name, url: a.external_urls?.spotify })),
		album: t.album?.name ?? "",
		art: t.album?.images?.[0]?.url ?? null,
		url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
		durationMs: t.duration_ms,
		previewUrl: await previewPath(t),
	};
}

const mockStart = Date.now();
async function mock(): Promise<SpotifyState> {
	const raw = {
		id: "mock",
		name: "Get Lucky",
		artists: [{ name: "Daft Punk", external_urls: { spotify: "https://open.spotify.com" } }],
		album: { name: "Random Access Memories", images: [] as { url: string }[] },
		external_urls: { spotify: "https://open.spotify.com" },
		external_ids: { isrc: "USQX91300108" },
		duration_ms: 369000,
	};
	const track = await toTrack(raw);
	const itunesArt = track.art ?? "https://placehold.co/300x300/f2e9e1/907aa9?text=%E2%99%AA";
	return {
		configured: true,
		track: { ...track, art: itunesArt },
		playing: true,
		progressMs: (Date.now() - mockStart) % raw.duration_ms,
		playedAt: null,
		fetchedAt: Date.now(),
	};
}

async function fetchState(): Promise<SpotifyState> {
	const player = await api("/me/player?additional_types=track");
	const isPrivate = player?.device?.is_private_session;
	if (player?.item && player.currently_playing_type === "track" && !isPrivate) {
		return {
			configured: true,
			track: await toTrack(player.item),
			playing: Boolean(player.is_playing),
			progressMs: player.progress_ms ?? null,
			playedAt: null,
			fetchedAt: Date.now(),
		};
	}

	const recent = await api("/me/player/recently-played?limit=1");
	const item = recent?.items?.[0];
	if (!item) return { configured: true, track: null };
	return {
		configured: true,
		track: await toTrack(item.track),
		playing: false,
		progressMs: null,
		playedAt: item.played_at,
		fetchedAt: Date.now(),
	};
}

const audioCache = new Map<string, Uint8Array<ArrayBuffer>>();

export async function proxyPreview(trackId: string, req: Request): Promise<Response> {
	const url = previewCache.get(trackId);
	if (!url) return new Response("no preview", { status: 404 });

	const key = new URL(url).pathname;
	let bytes = audioCache.get(key);
	if (!bytes) {
		const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
		if (!upstream.ok) return new Response("upstream error", { status: 502 });
		bytes = new Uint8Array(await upstream.arrayBuffer());
		audioCache.set(key, bytes);
		if (audioCache.size > 20) audioCache.delete(audioCache.keys().next().value!);
	}

	const type = /\.m4a|itunes/.test(url) ? "audio/mp4" : "audio/mpeg";
	const base = { "content-type": type, "accept-ranges": "bytes", "cache-control": "public, max-age=86400" };
	const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
	if (m) {
		const start = m[1] ? Number(m[1]) : 0;
		const end = m[2] ? Math.min(Number(m[2]), bytes.length - 1) : bytes.length - 1;
		const chunk = bytes.subarray(start, end + 1);
		return new Response(chunk, {
			status: 206,
			headers: { ...base, "content-length": String(chunk.length), "content-range": `bytes ${start}-${end}/${bytes.length}` },
		});
	}
	return new Response(bytes, { headers: { ...base, "content-length": String(bytes.length) } });
}

export async function getSpotify(): Promise<SpotifyState> {
	if (process.env.SPOTIFY_MOCK) return mock();
	const { id, secret, refresh } = env();
	if (!id || !secret || !refresh) return { configured: false };
	if (cache && Date.now() - cache.at < TTL) return cache.data;
	try {
		const data = await fetchState();
		cache = { at: Date.now(), data };
		return data;
	} catch (err) {
		spotify((err as Error).message);
		return cache?.data ?? { configured: true, track: null };
	}
}
