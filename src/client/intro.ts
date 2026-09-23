import { $ } from "./dom";

export function playIntro(name: string) {
	const body = document.body;
	document.querySelectorAll<HTMLElement>(".page .box, .footer").forEach((el, i) => {
		el.style.setProperty("--d", `${i * 70}ms`);
		el.classList.add("reveal");
	});

	const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
	if (reduceMotion || sessionStorage.getItem("intro")) {
		body.classList.remove("intro");
		body.classList.add("intro-done", "intro-fast");
		return;
	}
	sessionStorage.setItem("intro", "1");

	const text = $("intro-text");
	const msg = `hi, i'm ${name.toLowerCase()}`;
	let i = 0;
	const type = setInterval(() => {
		if (text) text.textContent = msg.slice(0, ++i);
		if (i >= msg.length) {
			clearInterval(type);
			setTimeout(() => {
				body.classList.remove("intro");
				body.classList.add("intro-done");
			}, 450);
		}
	}, 45);
}
