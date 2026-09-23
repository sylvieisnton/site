import contentJson from "../data/example.content.json";
import { render } from "preact";
import { $, load } from "./dom";
import { languageColor } from "./languages";

export type Content = {
	projects: { name: string; desc: string; href: string; icon: string }[];
	skills: { name: string; level: number; color: string }[];
	about: { title: string; note: string; items: string[] }[];
	favorites: { title: string; note: string; items: string[] }[];
	buttons: { src: string; alt: string; href: string }[];
};

export const fallbackContent: Content = contentJson;

export const loadContent = () => load("/api/content", renderContent);

const Blocks = ({ items }: { items: Content["about"] }) => (
	<>
		{items.map((item) => (
			<div class="about-block">
				<h3>{item.title}</h3>
				<p class="muted small">{item.note}</p>
				<ul class="bullets">{item.items.map((entry) => <li>{entry}</li>)}</ul>
			</div>
		))}
	</>
);

const Skills = ({ items }: { items: Content["skills"] }) => (
	<>
		{items.map((skill) => {
			const level = Number(skill.level) || 0;
			return (
				<li style={{ "--c": languageColor(skill.name) }}>
					<span class="dot" />
					<span class="name">{skill.name}</span>
					<span class="bar"><span style={{ "--w": `${level}%` }} /></span>
					<span class="pct">{level}%</span>
				</li>
			);
		})}
	</>
);

export function renderContent(c: Partial<Content>) {
	const about = $("about-list");
	if (about) render(<Blocks items={c.about ?? []} />, about);

	const favorites = $("favorites-list");
	if (favorites) render(<Blocks items={c.favorites ?? []} />, favorites);

	const skills = $("skill-list");
	if (skills) render(<Skills items={c.skills ?? []} />, skills);

	const buttons = $("buttons");
	if (buttons) {
		render(<>{(c.buttons ?? []).map((button) => <a href={button.href} target="_blank" rel="noopener"><img src={button.src} alt={button.alt} width="88" height="31" /></a>)}</>, buttons);
		const section = buttons.closest<HTMLElement>("section");
		if (section) section.hidden = !(c.buttons ?? []).length;
	}
}
