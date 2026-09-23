if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
	console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env first.");
	process.exit(1);
}

if (process.env.SPOTIFY_REFRESH_TOKEN) {
	console.log("SPOTIFY_REFRESH_TOKEN is already set.");
	process.exit(1);
}

const redirect = "http://127.0.0.1:8888/callback";
const scope = "user-read-currently-playing user-read-playback-state user-read-recently-played";
const auth = `https://accounts.spotify.com/authorize?${new URLSearchParams({
	client_id: process.env.SPOTIFY_CLIENT_ID,
	response_type: "code",
	redirect_uri: redirect,
	scope,
})}`;

let done = false;

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 8888,
	async fetch(req) {
		const url = new URL(req.url);
		if (url.pathname === "/") return Response.redirect(auth);
		if (url.pathname !== "/callback") return new Response("Not found", { status: 404 });
		if (done) return new Response("Already done. Check your terminal.");
		const code = url.searchParams.get("code");
		if (!code) return new Response(`Error: ${url.searchParams.get("error")}`, { status: 400 });

		const res = await fetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: {
				Authorization: `Basic ${btoa(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`)}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect }),
		});
		const json: any = await res.json();
		if (!json.refresh_token) return new Response(JSON.stringify(json, null, 2), { status: 400 });

		done = true;
		console.log(`\nAdd this to .env:\n\nSPOTIFY_REFRESH_TOKEN=${json.refresh_token}\n`);
		setTimeout(() => server.stop(), 500);
		return new Response("Check your terminal for the refresh token. You can close this tab.");
	},
});

console.log(`Open this URL:\n\n${auth}\n`);
