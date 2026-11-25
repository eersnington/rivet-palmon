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
	h.div(
		[h.Class("hero-stage px"), h.Style(sceneStyle), h.AriaHidden(true)],
		[
			h.div([h.Class("sky")], []),
			h.div([h.Class("clouds")], []),
			h.div([h.Class("hills far")], []),
			h.div([h.Class("hills near")], []),
			h.div(
				[h.Class("hero-slot left far")],
				[h.div([h.Class("platform")], []), h.div([h.Class("mon flip")], [creatureView("cinder", "front", false, h)])],
			),
			h.span([h.Class("vs")], ["VS"]),
			h.div(
				[h.Class("hero-slot right far")],
				[h.div([h.Class("platform")], []), h.div([h.Class("mon")], [creatureView("sus", "front", false, h)])],
			),
		],
	);

/** Finished battles, newest first. A new one slides in when its room ends. */
const recentView = (recent: ReadonlyArray<GameResult>, h: H) =>
	Array.match(recent, {
		onEmpty: () => h.div([], []),
		onNonEmpty: (results) =>
			h.section(
				[h.Class("hall")],
				[
					h.h2([h.Class("hall-title")], [icon("crown", "", h), "Hall"]),
					h.ol(
						[h.Id("recent"), h.Class("recent")],
						results.map((result) =>
							h.keyed("li")(
								result.code,
								[h.Class("recent-row px slide-in")],
								result.fighters.map((fighter, index) =>
									h.span(
										[
											h.Class(
												`recent-fighter ${index === 0 ? "" : "right"} ${result.winner === null || result.winner === fighter.name ? "" : "lost"}`,
											),
										],
										[
											miniSprite(fighter.critter, "tiny", h),
											h.span([h.Class("recent-name")], [fighter.name]),
											...(result.winner === fighter.name ? [icon("crown", "tiny", h)] : []),
											h.span([h.Class("recent-hp")], [`${fighter.hp} HP`]),
										],
									),
								),
							),
						),
					),
				],
			),
	});

export const view = (model: Model, h: H) => {
	const hasCode = model.codeInput.length === CODE_LENGTH;
	return h.main(
		[h.Class("home")],
		[
			h.keyed("div")("wipe-home", [h.Class("wipe"), h.AriaHidden(true)], []),
			h.div([h.Class("home-top")], [soundButtons(model, h)]),
			h.h1([h.Class("title")], ["Palmon"]),
			heroView(h),
			h.form(
				[h.Class("join px"), h.OnSubmit(hasCode ? Message.ClickedJoin() : Message.ClickedNewBattle())],
				[
					h.input([
						h.Id("name"),
						h.AriaLabel("Your name"),
						h.Placeholder("Your name"),
						h.Value(model.profile.name),
						h.Maxlength(MAX_NAME_LENGTH),
						h.Autocomplete("off"),
						h.Spellcheck(false),
						h.OnInput((name) => Message.UpdatedName({ name })),
						h.Class("field"),
					]),
					h.div(
						[h.Class("code-row")],
						[
							h.input([
								h.Id("code"),
								h.AriaLabel("Room code"),
								h.Placeholder("code"),
								h.Value(model.codeInput),
								h.Maxlength(CODE_LENGTH),
								h.Autocomplete("off"),
								h.Spellcheck(false),
								h.OnInput((code) => Message.UpdatedCode({ code })),
								h.Class("field code"),
							]),
							...(hasCode
								? [h.button([h.Type("button"), h.Class("btn"), h.OnClick(Message.ClickedWatch())], [icon("eye", "", h), "Watch"])]
								: []),
						],
					),
					h.button(
						[h.Id("primary"), h.Type("submit"), h.Class("btn primary big"), h.Disabled(model.isCreatingRoom)],
						[model.isCreatingRoom ? "…" : hasCode ? `Join ${model.codeInput}` : "Battle!"],
					),
					h.button(
						[h.Id("solo"), h.Type("button"), h.Class("btn"), h.Disabled(model.isCreatingRoom), h.OnClick(Message.ClickedSolo())],
						["Play solo vs CPU"],
					),
				],
			),
			recentView(model.recent, h),
		],
	);
};
