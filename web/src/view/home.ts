import { Array } from "effect";
import { type GameResult, MAX_NAME_LENGTH } from "../../../shared/api.ts";
import { sceneStyle } from "../art/scenery.ts";
import { CODE_LENGTH } from "../constant.ts";
import { Message } from "../message.ts";
import type { Model } from "../model.ts";
import { creatureView, miniSprite } from "./creature.ts";
import { type H, icon, soundButtons } from "./shared.ts";

/** Two creatures face off on a little stage. They breathe, blink and flick, as in battle. */
const heroView = (h: H) =>
	h.div
		.class("hero-stage px")
		.style(sceneStyle)
		.attr("aria-hidden", "true")
		.children(
			h.div.class("sky"),
			h.div.class("clouds"),
			h.div.class("hills far"),
			h.div.class("hills near"),
			h.div
				.class("hero-slot left far")
				.children(h.div.class("platform"), h.div.class("mon flip").children(creatureView("cinder", "front", false, h))),
			h.span.class("vs").children("VS"),
			h.div
				.class("hero-slot right far")
				.children(h.div.class("platform"), h.div.class("mon").children(creatureView("sus", "front", false, h))),
		);

/** Finished battles, newest first. A new one slides in when its room ends. */
const recentView = (recent: ReadonlyArray<GameResult>, h: H) =>
	Array.match(recent, {
		onEmpty: () => h.div,
		onNonEmpty: (results) =>
			h.section.class("hall").children(
				h.h2.class("hall-title").children(icon("crown", "", h), "Hall"),
				h.ol
					.id("recent")
					.class("recent")
					.children(
						results.map((result) =>
							h.li
								.key(result.code)
								.class("recent-row px slide-in")
								.children(
									result.fighters.map((fighter, index) =>
										h.span
											.class(
												`recent-fighter ${index === 0 ? "" : "right"} ${result.winner === null || result.winner === fighter.name ? "" : "lost"}`,
											)
											.children(
												miniSprite(fighter.critter, "tiny", h),
												h.span.class("recent-name").children(fighter.name),
												result.winner === fighter.name && icon("crown", "tiny", h),
												h.span.class("recent-hp").children(`${fighter.hp} HP`),
											),
									),
								),
						),
					),
			),
	});

export const view = (model: Model, h: H) => {
	const hasCode = model.codeInput.length === CODE_LENGTH;
	return h.main.class("home").children(
		h.div.key("wipe-home").class("wipe").attr("aria-hidden", "true"),
		h.div.class("home-top").children(soundButtons(model, h)),
		h.h1.class("title").children("Palmon"),
		heroView(h),
		h.form
			.class("join px")
			.on("submit", hasCode ? Message.ClickedJoin() : Message.ClickedNewBattle())
			.children(
				h.input
					.id("name")
					.attrs({
						"aria-label": "Your name",
						placeholder: "Your name",
						maxlength: String(MAX_NAME_LENGTH),
						autocomplete: "off",
						spellcheck: "false",
					})
					.value(model.profile.name)
					.on("input", ({ value }) => Message.UpdatedName({ name: value }))
					.class("field"),
				h.div.class("code-row").children(
					h.input
						.id("code")
						.attrs({
							"aria-label": "Room code",
							placeholder: "code",
							maxlength: String(CODE_LENGTH),
							autocomplete: "off",
							spellcheck: "false",
						})
						.value(model.codeInput)
						.on("input", ({ value }) => Message.UpdatedCode({ code: value }))
						.class("field code"),
					hasCode &&
						h.button
							.attr("type", "button")
							.class("btn")
							.on("click", Message.ClickedWatch())
							.children(icon("eye", "", h), "Watch"),
				),
				h.button
					.id("primary")
					.attr("type", "submit")
					.class("btn primary big")
					.disabled(model.isCreatingRoom)
					.children(model.isCreatingRoom ? "…" : hasCode ? `Join ${model.codeInput}` : "Battle!"),
				h.button
					.id("solo")
					.attr("type", "button")
					.class("btn")
					.disabled(model.isCreatingRoom)
					.on("click", Message.ClickedSolo())
					.children("Play solo vs CPU"),
			),
		recentView(model.recent, h),
	);
};
