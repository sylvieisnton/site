import { fallbackContent, loadContent, renderContent } from "./client/content";
import { loadGithub } from "./client/github";
import { playIntro } from "./client/intro";
import { fallbackProfile, firstName, loadProfile, renderProfile } from "./client/profile";

renderProfile(fallbackProfile);
renderContent(fallbackContent);
playIntro(firstName(fallbackProfile));

loadProfile();
loadContent();
loadGithub();
setInterval(loadGithub, 10 * 60000);

if ("EventSource" in window) {
	new EventSource("/api/events").addEventListener("config", () => {
		loadProfile();
		loadContent();
		loadGithub();
	});
}
