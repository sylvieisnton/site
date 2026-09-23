import homepage from "./index.html";
import projectsPage from "./projects.html";
import { getGithub } from "./github";
import { configPath, getConfig, initConfig, onConfigChange } from "./config";
import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { configureDiscord, getDiscord, startDiscord } from "./discord";
import { getSpotify, proxyPreview } from "./spotify";
import { site, discord } from "./logging";

type SyncField = "name" | "avatar" | "status" | "activities";

await initConfig();

const bootDiscord = () =>
	startDiscord({
		token: process.env.DISCORD_TOKEN,
		userId: getConfig("profile").discord?.id,
		config: getConfig("bot"),
	});
bootDiscord();

const clients = new Set<ReadableStreamDefaultController>();
const broadcast = (event: string) => {
	const msg = new TextEncoder().encode(`event: ${event}\ndata: {}\n\n`);
	for (const c of clients) {
		try {
			c.enqueue(msg);
		} catch {
			clients.delete(c);
		}
	}
};

onConfigChange((name, value, prev) => {
	if (name === "bot") configureDiscord(value);
	if (name === "profile" && value.discord?.id !== prev.discord?.id) {
		discord("discord.id changed — restarting bot");
		bootDiscord();
	}
	broadcast("config");
});

const PUBLIC_DIR = join(import.meta.dir, "public");

function publicFile(pathname: string) {
	const file = resolve(PUBLIC_DIR, "." + decodeURIComponent(pathname));
	if (!file.startsWith(PUBLIC_DIR + "/")) return null;
	try {
		return statSync(file).isFile() ? file : null;
	} catch {
		return null;
	}
}

function localAvatar(): { url: string; file?: string } | null {
	const raw = String(getConfig("profile").avatar ?? "").trim();
	if (!raw) return null;
	if (/^(https?:)?\/\//.test(raw) || raw.startsWith("data:")) return { url: raw };
	if (raw.startsWith("/")) {
		const file = publicFile(raw);
		return file ? { url: `${raw}?v=${Math.floor(statSync(file).mtimeMs)}`, file } : null;
	}
	const file = configPath(raw);
	try {
		const s = statSync(file);
		if (!s.isFile()) return null;
		return { url: `/avatar?v=${Math.floor(s.mtimeMs)}`, file };
	} catch {
		return null;
	}
}

function getProfile() {
	const profile: any = getConfig("profile");
	const sync = new Set<SyncField>(profile.discord?.sync ?? []);
	const discord = getDiscord();

	const pick = <T>(field: SyncField, live: T | undefined, fallback: T) =>
		sync.has(field) && live ? live : fallback;

	return {
		...profile,
		name: pick("name", discord?.name, profile.name),
		avatar: localAvatar()?.url ?? discord?.avatar ?? "",
		status: pick("status", discord?.status, profile.status),
		statusEmoji: sync.has("status") ? discord?.statusEmoji : undefined,
		presence: discord?.presence ?? null,
		activities: sync.has("activities") ? (discord?.activities ?? []) : [],
		banner: discord?.banner ?? null,
		accentColor: discord?.accentColor ?? null,
		platforms: discord?.platforms ?? [],
		discord: discord ? { id: discord.id, username: discord.username } : null,
	};
}

const server = Bun.serve({
	hostname: process.env.HOST ?? "0.0.0.0",
	port: Number(process.env.PORT ?? 3000),
	routes: {
		"/": homepage,
		"/projects": projectsPage,
		"/avatar": () => {
			const local = localAvatar();
			if (!local?.file) return new Response("no local avatar", { status: 404 });
			return new Response(Bun.file(local.file), { headers: { "cache-control": "public, max-age=86400" } });
		},
		"/api/github": async () =>
			Response.json(await getGithub(getConfig("profile").username), {
				headers: { "cache-control": "no-store" },
			}),
		"/api/health": () => Response.json({ ok: true }),
		"/api/profile": () => Response.json(getProfile(), { headers: { "cache-control": "no-store" } }),
		"/api/content": () => Response.json(getConfig("content"), { headers: { "cache-control": "no-store" } }),
		"/api/events": (req) => {
			let ctrl: ReadableStreamDefaultController;
			let ping: ReturnType<typeof setInterval>;
			const stream = new ReadableStream({
				start(c) {
					ctrl = c;
					clients.add(c);
					c.enqueue(new TextEncoder().encode("retry: 5000\n\n"));
					ping = setInterval(() => {
						try {
							c.enqueue(new TextEncoder().encode(": ping\n\n"));
						} catch {
							clearInterval(ping);
						}
					}, 25000);
				},
				cancel() {
					clearInterval(ping);
					clients.delete(ctrl);
				},
			});
			req.signal.addEventListener("abort", () => {
				clearInterval(ping);
				clients.delete(ctrl);
			});
			return new Response(stream, {
				headers: {
					"content-type": "text/event-stream",
					"cache-control": "no-store",
					"x-accel-buffering": "no",
				},
			});
		},
		"/api/spotify": async () =>
			Response.json(await getSpotify(), { headers: { "cache-control": "no-store" } }),
		"/api/spotify/preview/:id": (req) => proxyPreview(req.params.id, req),
		"/api/discord": () => {
			const data = getDiscord();
			return data
				? Response.json(data, { headers: { "cache-control": "no-store" } })
				: Response.json({ error: "bot not connected or can't see you yet" }, { status: 503 });
		},
	},
	development: process.env.NODE_ENV !== "production" && {
		hmr: true,
		console: true,
	},
	fetch(req) {
		const file = publicFile(new URL(req.url).pathname);
		if (file) return new Response(Bun.file(file), { headers: { "cache-control": "public, max-age=86400" } });
		return new Response("404 not found", { status: 404 });
	},
});

site(`site running at ${server.url}`);
