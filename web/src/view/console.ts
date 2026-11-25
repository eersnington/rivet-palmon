//! The bottom half of the arena: the text box and the move menu.
import { Option } from "effect";
import type { Card, FighterView, RoomView } from "../../../shared/api.ts";
import { CREATURES, creatureInfo, moveType } from "../art/creatures.ts";
import { Message } from "../message.ts";
import { type Arena, currentHand, remainingMs } from "../model.ts";
import type { Beat } from "../reveal.ts";
import { miniSprite } from "./creature.ts";
import { type H, icon, ms, pips } from "./shared.ts";

const TIMER_PIPS = 12;

/** The end time of a line that stays, far past any phase. */
const LINE_KEPT_MS = 86_400_000;

const timerView = (arena: Arena, view: RoomView, h: H) => {
	if (view.phase !== "pick" || view.deadlineAt === null || view.phaseMs === 0) return h.div([h.Class("timer idle")], []);
	const left = remainingMs(arena, view);
	const lit = Math.ceil((left / view.phaseMs) * TIMER_PIPS);
	return h.div(
		[h.Class(`timer ${lit <= 3 ? "urgent" : ""}`), h.AriaLabel(`${Math.ceil(left / 1000)} seconds`)],
		[icon("clock", "", h), pips(TIMER_PIPS, lit, "time", h)],
	);
};

/** Text that types itself out, one letter at a time, from `delayMs`. */
const typedView = (text: string, delayMs: number, h: H) =>
	h.span(
		[h.Class("typed"), h.AriaLabel(text)],
		[...text].map((char, index) =>
			h.span([h.Class("ch"), h.AriaHidden(true), h.Style({ "animation-delay": ms(delayMs + index * 24) })], [char === " " ? " " : char]),
		),
	);

/** One message of the text box, and when it shows. */
interface Line {
	readonly key: string;
	readonly lines: ReadonlyArray<string>;
	readonly fromMs: number;
	/** When the next message replaces this one. `null` keeps it. */
	readonly untilMs: number | null;
}

const monName = (fighter: FighterView | undefined) =>
	fighter?.critter === null || fighter?.critter === undefined ? "?" : creatureInfo(fighter.critter).name;

const once = (key: string, ...lines: Array<string>): ReadonlyArray<Line> => [{ key, lines, fromMs: 0, untilMs: null }];

/** What a beat's move did, in the words of the text box. */
const beatResult = (view: RoomView, beat: Beat, user: FighterView | undefined, target: FighterView | undefined) => {
	const targetPlay = view.plays.find((play) => play.playerId === target?.id);
	switch (beat.play.card) {
		case "hit":
			return targetPlay?.card === "guard" ? `${monName(target)} blocked most of it.` : `${monName(target)} took a hit!`;
		case "smash":
			return targetPlay?.card === "guard" ? `Blocked! ${monName(user)} took recoil.` : "A big hit!";
		case "guard":
			return `${monName(user)} braced itself.`;
		case "snack": {
			const healed = view.plays.find((play) => play.playerId === user?.id)?.healed ?? 0;
			return healed > 0 ? `${monName(user)} got ${healed} HP back.` : `${monName(user)} is already full.`;
		}
	}
};

/** What the text box says, as messages with their times. */
const sayLines = (
	arena: Arena,
	view: RoomView,
	me: FighterView | undefined,
	them: FighterView | undefined,
	beats: ReadonlyArray<Beat>,
): ReadonlyArray<Line> => {
	switch (view.phase) {
		case "lobby": {
			if (arena.role === "spectator") return once("lobby", "The battle starts soon.");
			if (me === undefined || me.critter === null) return once("lobby-pick", "Choose your partner!");
			if (them === undefined) return once("lobby-invite", `${monName(me)} is ready.`, "Invite a friend to battle!");
			return once(`lobby-${them.critter === null}`, `${them.name} is here!`, them.critter === null ? `${them.name} is choosing…` : "Here we go!");
		}
		case "pick": {
			if (arena.role === "spectator") return once(`pick-${view.turn}`, `${me?.name ?? "?"} and ${them?.name ?? "?"} are choosing…`);
			const hasPlayed = Option.exists(currentHand(arena, view), (hand) => hand.played !== null);
			if (!hasPlayed) return once(`pick-${view.turn}`, view.turn === 1 ? `Go, ${monName(me)}!` : "Pick a move.");
			return once(
				`ready-${view.turn}-${them?.locked === true}`,
				`${monName(me)} is ready.`,
				them?.locked === true ? "Here it comes…" : `Waiting for ${them?.name ?? "rival"}…`,
			);
		}
		case "reveal":
			return beats.map((beat, index) => {
				const user = view.fighters.find((fighter) => fighter.id === beat.play.playerId);
				const target = view.fighters.find((fighter) => fighter.id !== beat.play.playerId);
				const move = user?.critter == null ? beat.play.card : creatureInfo(user.critter).moves[beat.play.card];
				const used = `${beat.play.auto ? "Too slow! " : ""}${monName(user)} used ${move}!`;
				const next = beats[index + 1];
				return {
					key: `beat-${view.turn}-${index}`,
					lines: [used, beatResult(view, beat, user, target)],
					fromMs: beat.startMs,
					untilMs: next?.startMs ?? null,
				};
			});
		case "over": {
			const loser = view.fighters.find((fighter) => fighter.hp === 0);
			const winner = view.fighters.find((fighter) => fighter.id === view.winnerId);
			return once("over", loser === undefined ? "Time's up!" : `${monName(loser)} fainted!`, winner === undefined ? "It's a draw." : `${winner.name} wins!`);
		}
	}
};

const MENU_ORDER: ReadonlyArray<Card> = ["hit", "smash", "guard", "snack"];

const POWER: Readonly<Record<Card, string>> = { hit: "3", smash: "6", guard: "Block", snack: "+4" };

/** Spectators see a locked menu. A peek is refused by `canSubscribe`. */
const secretMenuView = (arena: Arena, h: H) => {
	const isRefused = arena.peek._tag === "Refused";
	const isTrying = arena.peek._tag === "Trying";
	return h.div(
		[h.Class("menu secret")],
		[
			h.keyed("div")(
				`locks-${arena.peek._tag}`,
				[h.Class(`locks ${isRefused ? "shake" : ""}`)],
				[0, 1, 2, 3].map(() => h.div([h.Class("move px out")], [icon("lock", "lock-icon", h)])),
			),
			isRefused
				? h.keyed("span")("nope", [h.Class("nope stamp")], ["Nope"])
				: h.button(
						[h.Type("button"), h.Class("btn small peek"), h.Disabled(isTrying), h.OnClick(Message.ClickedPeek())],
						[icon("eye", "", h), isTrying ? "…" : "Peek"],
					),
		],
	);
};

const lobbyMenuView = (arena: Arena, me: FighterView | undefined, them: FighterView | undefined, h: H) => {
	if (arena.role === "spectator") return h.div([h.Class("menu-end")], [h.span([h.Class("bob")], ["Waiting"])]);
	if (me === undefined || me.critter === null) {
		return h.div(
			[h.Class("picker")],
			CREATURES.map((critter, index) => {
				const info = creatureInfo(critter);
				return h.button(
					[
						h.Type("button"),
						h.DataAttribute("critter", critter),
						h.Class("pick px dealt"),
						h.Style({ "--type": info.typeColor, "animation-delay": ms(index * 70) }),
						h.Disabled(arena.isPicking),
						h.OnClick(Message.ClickedCritter({ critter })),
					],
					[miniSprite(critter, "", h), h.span([h.Class("move-name")], [info.name]), h.span([h.Class("type")], [info.type])],
				);
			}),
		);
	}
	return them === undefined
		? h.div([h.Class("menu-end")], [h.button([h.Type("button"), h.Class("btn primary big"), h.OnClick(Message.ClickedCopyLink())], ["Invite"])])
		: h.div([h.Class("menu-end")], [h.span([h.Class("bob")], ["Waiting"])]);
};

/** The room ends itself when this bar runs out, and everyone goes home. */
const endMenuView = (arena: Arena, view: RoomView, h: H) => {
	const left = view.phaseMs === 0 ? 0 : remainingMs(arena, view) / view.phaseMs;
	return h.div(
		[h.Class("menu-end")],
		[
			h.button(
				[h.Type("button"), h.Class("btn primary big home-btn"), h.OnClick(Message.ClickedLeave())],
				["Home", h.span([h.Class("home-drain"), h.Style({ transform: `scaleX(${Math.max(0, Math.min(1, left))})` })], [])],
			),
		],
	);
};

const moveMenuView = (arena: Arena, view: RoomView, me: FighterView | undefined, h: H) => {
	const critter = me?.critter ?? "cinder";
	const info = creatureInfo(critter);
	const hand = Option.getOrNull(currentHand(arena, view));
	const isPick = view.phase === "pick";
	return h.div(
		[h.Class("menu")],
		MENU_ORDER.map((card, index) => {
			const charges = hand === null ? 0 : hand.cards.filter((entry) => entry === card).length;
			const isChosen = hand?.played === card;
			const canPlay = isPick && hand !== null && hand.played === null && charges > 0;
			const typeColor = card === "guard" ? "#4fd8d0" : card === "snack" ? "#86d27a" : info.typeColor;
			return h.keyed("button")(
				`move-${card}`,
				[
					h.Type("button"),
					h.DataAttribute("card", card),
					h.Class(
						`move px ${isChosen ? "chosen" : ""} ${charges === 0 || (hand?.played != null && !isChosen) ? "out" : ""} ${hand === null ? "" : "dealt"}`,
					),
					h.Style({ "--type": typeColor, "animation-delay": ms(index * 60) }),
					h.Disabled(!canPlay),
					h.OnClick(Message.ClickedCard({ card })),
				],
				[
					h.span([h.Class("move-name")], [info.moves[card]]),
					h.span(
						[h.Class("move-meta")],
						[
							h.span([h.Class("type")], [moveType(critter, card)]),
							h.span([h.Class("power")], [charges === 0 ? "—" : charges > 1 ? `${POWER[card]} x${charges}` : POWER[card]]),
						],
					),
				],
			);
		}),
	);
};

const menuView = (arena: Arena, view: RoomView, me: FighterView | undefined, them: FighterView | undefined, h: H) => {
	if (view.phase === "lobby") return lobbyMenuView(arena, me, them, h);
	if (view.phase === "over") return endMenuView(arena, view, h);
	if (arena.role === "spectator") return secretMenuView(arena, h);
	return moveMenuView(arena, view, me, h);
};

export const consoleView = (
	arena: Arena,
	view: RoomView,
	me: FighterView | undefined,
	them: FighterView | undefined,
	beats: ReadonlyArray<Beat>,
	h: H,
) =>
	h.div(
		[h.Class("console")],
		[
			h.div(
				[h.Class("say px"), h.AriaLive("polite")],
				[
					timerView(arena, view, h),
					...sayLines(arena, view, me, them, beats).map((line) =>
						h.keyed("div")(
							line.key,
							[
								// The animation list never changes, so a line that learns its end later keeps its
								// start time instead of restarting `say-out` and staying on screen.
								h.Class("say-line"),
								h.Style({ "--from": ms(line.fromMs), "--until": ms(line.untilMs ?? LINE_KEPT_MS) }),
							],
							line.lines.map((text, index) => h.div([], [typedView(text, line.fromMs + (index === 0 ? 0 : 420), h)])),
						),
					),
				],
			),
			h.div([h.Class("menu-wrap")], [menuView(arena, view, me, them, h)]),
		],
	);

