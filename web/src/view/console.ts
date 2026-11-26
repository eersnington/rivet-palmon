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
	if (view.phase !== "pick" || view.deadlineAt === null || view.phaseMs === 0) return h.div.class("timer idle");
	const left = remainingMs(arena, view);
	const lit = Math.ceil((left / view.phaseMs) * TIMER_PIPS);
	return h.div
		.class(`timer ${lit <= 3 ? "urgent" : ""}`)
		.attr("aria-label", `${Math.ceil(left / 1000)} seconds`)
		.children(icon("clock", "", h), pips(TIMER_PIPS, lit, "time", h));
};

/** Text that types itself out, one letter at a time, from `delayMs`. */
const typedView = (text: string, delayMs: number, h: H) =>
	h.span
		.class("typed")
		.attr("aria-label", text)
		.children(
			[...text].map((char, index) =>
				h.span.class("ch").attr("aria-hidden", "true").style({ animationDelay: ms(delayMs + index * 24) }).children(char),
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
	return h.div.class("menu secret").children(
		h.div
			.key(`locks-${arena.peek._tag}`)
			.class(`locks ${isRefused ? "shake" : ""}`)
			.children([0, 1, 2, 3].map(() => h.div.class("move px out").children(icon("lock", "lock-icon", h)))),
		isRefused
			? h.span.key("nope").class("nope stamp").children("Nope")
			: h.button
					.attr("type", "button")
					.class("btn small peek")
					.disabled(isTrying)
					.on("click", Message.ClickedPeek())
					.children(icon("eye", "", h), isTrying ? "…" : "Peek"),
	);
};

const waitingView = (h: H) => h.div.class("menu-end").children(h.span.class("bob").children("Waiting"));

const lobbyMenuView = (arena: Arena, me: FighterView | undefined, them: FighterView | undefined, h: H) => {
	if (arena.role === "spectator") return waitingView(h);
	if (me === undefined || me.critter === null) {
		return h.div.class("picker").children(
			CREATURES.map((critter, index) => {
				const info = creatureInfo(critter);
				return h.button
					.attrs({ type: "button", "data-critter": critter })
					.class("pick px dealt")
					.style({ "--type": info.typeColor, animationDelay: ms(index * 70) })
					.disabled(arena.isPicking)
					.on("click", Message.ClickedCritter({ critter }))
					.children(miniSprite(critter, "", h), h.span.class("move-name").children(info.name), h.span.class("type").children(info.type));
			}),
		);
	}
	return them === undefined
		? h.div
				.class("menu-end")
				.children(h.button.attr("type", "button").class("btn primary big").on("click", Message.ClickedCopyLink()).children("Invite"))
		: waitingView(h);
};

/** The room ends itself when this bar runs out, and everyone goes home. */
const endMenuView = (arena: Arena, view: RoomView, h: H) => {
	const left = view.phaseMs === 0 ? 0 : remainingMs(arena, view) / view.phaseMs;
	return h.div.class("menu-end").children(
		h.button
			.attr("type", "button")
			.class("btn primary big home-btn")
			.on("click", Message.ClickedLeave())
			.children("Home", h.span.class("home-drain").style({ transform: `scaleX(${Math.max(0, Math.min(1, left))})` })),
	);
};

const moveMenuView = (arena: Arena, view: RoomView, me: FighterView | undefined, h: H) => {
	const critter = me?.critter ?? "cinder";
	const info = creatureInfo(critter);
	const hand = Option.getOrNull(currentHand(arena, view));
	const isPick = view.phase === "pick";
	return h.div.class("menu").children(
		MENU_ORDER.map((card, index) => {
			const charges = hand === null ? 0 : hand.cards.filter((entry) => entry === card).length;
			const isChosen = hand?.played === card;
			const canPlay = isPick && hand !== null && hand.played === null && charges > 0;
			const typeColor = card === "guard" ? "#4fd8d0" : card === "snack" ? "#86d27a" : info.typeColor;
			return h.button
				.key(`move-${card}`)
				.attrs({ type: "button", "data-card": card })
				.class(
					`move px ${isChosen ? "chosen" : ""} ${charges === 0 || (hand?.played != null && !isChosen) ? "out" : ""} ${hand === null ? "" : "dealt"}`,
				)
				.style({ "--type": typeColor, animationDelay: ms(index * 60) })
				.disabled(!canPlay)
				.on("click", Message.ClickedCard({ card }))
				.children(
					h.span.class("move-name").children(info.moves[card]),
					h.span
						.class("move-meta")
						.children(
							h.span.class("type").children(moveType(critter, card)),
							h.span.class("power").children(charges === 0 ? "—" : charges > 1 ? `${POWER[card]} x${charges}` : POWER[card]),
						),
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
	h.div.class("console").children(
		h.div
			.class("say px")
			.attr("aria-live", "polite")
			.children(
				timerView(arena, view, h),
				sayLines(arena, view, me, them, beats).map((line) =>
					h.div
						.key(line.key)
						// The animation list never changes, so a line that learns its end later keeps its
						// start time instead of restarting `say-out` and staying on screen.
						.class("say-line")
						.style({ "--from": ms(line.fromMs), "--until": ms(line.untilMs ?? LINE_KEPT_MS) })
						.children(line.lines.map((text, index) => h.div.children(typedView(text, line.fromMs + (index === 0 ? 0 : 420), h)))),
				),
			),
		h.div.class("menu-wrap").children(menuView(arena, view, me, them, h)),
	);
