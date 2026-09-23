import { ActivityType, Client, GatewayIntentBits, type Presence as DjsPresence } from "discord.js";
import { discord } from "./logging";

export type Activity = {
	type: "playing" | "streaming" | "listening" | "watching" | "competing";
	name: string;
	details?: string;
	state?: string;
	image?: string;
	smallImage?: string;
	start?: number;
	end?: number;
	url?: string;
};

export type DiscordProfile = {
	id: string;
	username: string;
	name: string;
	avatar: string;
	banner?: string;
	accentColor?: string;
	presence: "online" | "idle" | "dnd" | "offline";
	platforms: ("desktop" | "mobile" | "web")[];
	status?: string;
	statusEmoji?: string;
	activities: Activity[];
	updatedAt: number;
};

type BotConfig = {
	status?: "online" | "idle" | "dnd" | "invisible";
	activities?: { type: keyof typeof ActivityType | Lowercase<keyof typeof ActivityType>; name?: string; state?: string; url?: string }[];
	rotateSeconds?: number;
	filterActivities?: string[];
	userRefreshMinutes?: number;
};

const TYPES = ["playing", "streaming", "listening", "watching", "custom", "competing"] as const;
const typeOf = (t: string) => ActivityType[(t[0]!.toUpperCase() + t.slice(1)) as keyof typeof ActivityType];

let client: Client | null = null;
let userId = "";
let config: BotConfig = {};
let timers: ReturnType<typeof setInterval>[] = [];
let presence: DjsPresence | null = null;

export function configureDiscord(raw: unknown) {
	config = (raw ?? {}) as BotConfig;
	timers.forEach(clearInterval);
	timers = [];
	const list = (config.activities ?? []).filter((a) => a && (a.name || a.state));
	let i = 0;
	const apply = () => {
		const a = list[i++ % Math.max(list.length, 1)];
		client?.user?.setPresence({
			status: config.status ?? "online",
			activities: a ? [{ type: typeOf(a.type), name: a.name ?? a.state!, state: a.state ?? a.name, url: a.url }] : [],
		});
	};
	if (client?.isReady()) apply();
	if (list.length > 1) timers.push(setInterval(apply, Math.max(15, config.rotateSeconds ?? 30) * 1000));
	timers.push(setInterval(() => client?.users.fetch(userId, { force: true }).catch(() => { }), Math.max(1, config.userRefreshMinutes ?? 10) * 60000));
	client?.once("clientReady", apply);
}

export function startDiscord(opts: { token?: string; userId?: string; config?: unknown }) {
	client?.destroy();
	client = null;
	presence = null;
	if (!opts.token || !opts.userId) return discord("DISCORD_TOKEN or discord.id not set.");
	userId = opts.userId;
	client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences] });

	client.once("clientReady", async (c) => {
		discord(`connected as ${c.user.username} (${c.guilds.cache.size} servers)`);
		await c.application.commands.set([]).catch(() => { });
		await c.users.fetch(userId, { force: true }).catch(() => { });
		for (const g of c.guilds.cache.values()) {
			const m = await g.members.fetch({ user: userId, withPresences: true }).catch(() => null);
			if (m?.presence) presence = m.presence;
		}
		if (!presence && !c.guilds.cache.some((g) => g.members.cache.has(userId)))
			discord(`you aren't in a server with the bot. Invite it:\n  https://discord.com/oauth2/authorize?client_id=${c.user.id}&scope=bot`);
	});
	client.on("presenceUpdate", (_, p) => {
		if (p.userId === userId) presence = p;
	});
	client.on("error", (e) => discord(`error: ${e.message}`));

	configureDiscord(opts.config);
	client.login(opts.token).catch((e) => discord(`login failed: ${e.message}`));
}

export function getDiscord(): DiscordProfile | null {
	const u = client?.users.cache.get(userId);
	if (!u) return null;
	const p = presence;
	const status = p?.status && p.status !== "invisible" ? p.status : "offline";
	const acts = status === "offline" ? [] : (p?.activities ?? []);
	const custom = acts.find((a) => a.type === ActivityType.Custom);
	const hidden = (config.filterActivities ?? ["Spotify"]).map((n) => n.toLowerCase());

	return {
		id: u.id,
		username: u.username,
		name: u.globalName ?? u.username,
		avatar: u.displayAvatarURL({ size: 256 }),
		banner: u.bannerURL({ size: 600 }) ?? undefined,
		accentColor: u.hexAccentColor ?? undefined,
		presence: status,
		platforms: Object.keys(p?.clientStatus ?? {}) as DiscordProfile["platforms"],
		status: custom?.state ?? undefined,
		statusEmoji: custom?.emoji ? (custom.emoji.id ? custom.emoji.imageURL() ?? undefined : custom.emoji.name ?? undefined) : undefined,
		activities: acts
			.filter((a) => a !== custom && !hidden.includes(a.name.toLowerCase()) && !(hidden.includes("spotify") && a.syncId))
			.map((a) => ({
				type: (TYPES[a.type] ?? "playing") as Activity["type"],
				name: a.name,
				details: a.details ?? undefined,
				state: a.state ?? undefined,
				image: a.assets?.largeImageURL() ?? undefined,
				smallImage: a.assets?.smallImageURL() ?? undefined,
				start: a.timestamps?.start?.getTime(),
				end: a.timestamps?.end?.getTime(),
				url: a.url ?? undefined,
			})),
		updatedAt: Date.now(),
	};
}
