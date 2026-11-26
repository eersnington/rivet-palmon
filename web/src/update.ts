import { UiStruct } from "@effect/ui";
import { Array, Option } from "effect";
import { MAX_NAME_LENGTH, type Role } from "../../shared/api.ts";
import {
	ClearSeat,
	CopyLink,
	CreateRoom,
	FetchHand,
	PeekHand,
	PickCritter,
	PlayCard,
	PlayCues,
	SaveMusicOff,
	SaveMuted,
	SaveProfile,
	SaveSeat,
	WaitBeforeHidingNotice,
} from "./command.ts";
import { CLOSE_GRACE_MS, CODE_LENGTH, RECENT_LIMIT } from "./constant.ts";
import { PalmonDef } from "./definition.ts";
import { type Arena, maybeArenaOf, type Model, newArena, Peek, Screen } from "./model.ts";
import { countdownCue, roomChangeCues } from "./room-cues.ts";
import { type Cue, cue } from "./sound.ts";

// STEPS

const showNotice = (text: string) =>
	PalmonDef.update(($) => {
		const id = $.model.noticeCount + 1;
		return $.evolve({ maybeNotice: Option.some({ id, text }), noticeCount: id }).run(WaitBeforeHidingNotice.make({ id }));
	});

/** The Command that plays `cues`, or none for no cues. */
const playCues = (cues: ReadonlyArray<Cue>) =>
	Array.match(cues, {
		onEmpty: () => [],
		onNonEmpty: (nonEmptyCues) => [PlayCues.make({ cues: nonEmptyCues })],
	});

const enterArena = (code: string, role: Role) =>
	PalmonDef.update(($) =>
		$.evolve({ screen: Screen.Arena({ arena: newArena(code, role) }), codeInput: code, isCreatingRoom: false }).run(
			SaveSeat.make({ seat: { code, role } }),
		),
	);

/** Opens a room for this player: for a friend, or with a computer trainer when `solo`. */
const createRoom = (solo: boolean) =>
	PalmonDef.update(($) => {
		const name = $.model.profile.name.trim();
		if (name === "") return $.combine(showNotice("Name first"));
		return $.evolve({ isCreatingRoom: true }).run(
			CreateRoom.make({ profile: { playerId: $.model.profile.playerId, name }, solo }),
		);
	});

const goHome = PalmonDef.update(($) => $.evolve({ screen: Screen.Home(), isCreatingRoom: false }).run(ClearSeat.make({})));

/** `onArena` with the arena, or the Model unchanged on the home screen. */
const withArena = <A>(model: Model, onArena: (arena: Arena) => A): A | Model =>
	Option.match(maybeArenaOf(model), { onNone: (): A | Model => model, onSome: onArena });

const arenaScreen = (arena: Arena) => Screen.Arena({ arena });

const normalizeCode = (code: string) =>
	code
		.toUpperCase()
		.replace(/[^A-Z]/g, "")
		.slice(0, CODE_LENGTH);

const MOVE_REFUSED_TEXT: Readonly<Record<string, string>> = {
	not_a_player: "Only fighters can do that",
	wrong_phase: "Too late",
	not_in_hand: "Not in your hand",
	already_done: "Already played",
};

// UPDATE

export const update = {
	// Page

	InteractedWithPage: PalmonDef.update("InteractedWithPage", ($) => $.evolve({ hasInteracted: true })),
	ToggledSound: PalmonDef.update("ToggledSound", ($, { pressed }) =>
		$.evolve({ isSoundOn: pressed }).run(SaveMuted.make({ isMuted: !pressed })),
	),
	ToggledMusic: PalmonDef.update("ToggledMusic", ($, { pressed }) =>
		$.evolve({ isMusicOn: pressed }).run(SaveMusicOff.make({ isMusicOff: !pressed })),
	),
	CompletedWaitBeforeHidingNotice: PalmonDef.update("CompletedWaitBeforeHidingNotice", ($, { id }) =>
		Option.exists($.model.maybeNotice, (notice) => notice.id === id) ? $.evolve({ maybeNotice: Option.none() }) : $.model,
	),

	// Home

	UpdatedName: PalmonDef.update("UpdatedName", ($, { name }) => {
		const profile = UiStruct.evolve($.model.profile, { name: name.slice(0, MAX_NAME_LENGTH) });
		return $.evolve({ profile }).run(SaveProfile.make({ profile }));
	}),
	UpdatedCode: PalmonDef.update("UpdatedCode", ($, { code }) => $.evolve({ codeInput: normalizeCode(code) })),
	ClickedNewBattle: PalmonDef.update("ClickedNewBattle", ($) => $.combine(createRoom(false))),
	ClickedSolo: PalmonDef.update("ClickedSolo", ($) => $.combine(createRoom(true))),
	ClickedJoin: PalmonDef.update("ClickedJoin", ($) => {
		if ($.model.profile.name.trim() === "") return $.combine(showNotice("Name first"));
		if ($.model.codeInput.length !== CODE_LENGTH) return $.combine(showNotice("4-letter code"));
		return $.combine(enterArena($.model.codeInput, "player"));
	}),
	ClickedWatch: PalmonDef.update("ClickedWatch", ($) =>
		$.model.codeInput.length !== CODE_LENGTH
			? $.combine(showNotice("4-letter code"))
			: $.combine(enterArena($.model.codeInput, "spectator")),
	),
	SucceededCreateRoom: PalmonDef.update("SucceededCreateRoom", ($, { code }) => $.combine(enterArena(code, "player"))),
	FailedCreateRoom: PalmonDef.update("FailedCreateRoom", ($) =>
		$.combine(($) => $.evolve({ isCreatingRoom: false }), showNotice("Could not open a room")),
	),
	UpdatedRecentResults: PalmonDef.update("UpdatedRecentResults", ($, { results }) => $.evolve({ recent: results })),
	RecordedResult: PalmonDef.update("RecordedResult", ($, { result }) =>
		$.evolve({
			recent: (recent) => Array.take([result, ...recent.filter((entry) => entry.code !== result.code)], RECENT_LIMIT),
		}),
	),

	// Arena

	// Views can arrive out of order, so keep the one with the highest `seq`.
	UpdatedRoomView: PalmonDef.update("UpdatedRoomView", ($, { view, receivedAtMs }) =>
		withArena($.model, (arena) => {
			const isNewer = Option.match(arena.maybeView, {
				onNone: () => true,
				onSome: (current) => current.code !== view.code || view.seq >= current.seq,
			});
			if (!isNewer) return $.evolve({ screen: arenaScreen(UiStruct.evolve(arena, { isLive: true })) });

			const cues = Option.match(arena.maybeView, {
				onNone: () => [],
				onSome: (before) => roomChangeCues(arena, $.model.profile.playerId, before, view, $.model.isMusicOn),
			});
			const nextArena = UiStruct.evolve(arena, {
				maybeView: Option.some(view),
				clockOffsetMs: receivedAtMs - view.sentAt,
				nowMs: receivedAtMs,
				isLive: true,
			});
			// A hand sent while this tab reconnected is lost, so ask for it.
			const isHandMissing =
				arena.role === "player" && view.phase === "pick" && !Option.exists(arena.maybeHand, (hand) => hand.turn === view.turn);
			return $.evolve({ screen: arenaScreen(nextArena) }).run(
				...(isHandMissing ? [FetchHand.make({ code: view.code, profile: $.model.profile })] : []),
				...playCues(cues),
			);
		}),
	),
	UpdatedHand: PalmonDef.update("UpdatedHand", ($, { maybeHand }) =>
		withArena($.model, (arena) => {
			const isOlder = Option.exists(maybeHand, (hand) =>
				Option.exists(arena.maybeHand, (current) => current.turn > hand.turn),
			);
			return Option.isNone(maybeHand) || isOlder
				? $.model
				: $.evolve({ screen: arenaScreen(UiStruct.evolve(arena, { maybeHand })) });
		}),
	),
	// A full room or a fight that started still lets you watch.
	RefusedSeat: PalmonDef.update("RefusedSeat", ($, { reason }) =>
		withArena($.model, (arena) =>
			reason === "name"
				? $.combine(goHome, showNotice("Name first"))
				: $.combine(
						enterArena(arena.code, "spectator"),
						showNotice(reason === "full" ? "Room is full. Watching." : "Already fighting. Watching."),
					),
		),
	),
	DisappearedRoom: PalmonDef.update("DisappearedRoom", ($) =>
		withArena($.model, (arena) =>
			Option.exists(arena.maybeView, (view) => view.phase === "over")
				? $.combine(goHome)
				: $.combine(goHome, showNotice(`No room ${arena.code}`)),
		),
	),
	LostRoomConnection: PalmonDef.update("LostRoomConnection", ($) =>
		withArena($.model, (arena) => $.evolve({ screen: arenaScreen(UiStruct.evolve(arena, { isLive: false })) })),
	),

	// The room destroys itself when the result's time is up, so go home then.
	TickedClock: PalmonDef.update("TickedClock", ($, { nowMs }) =>
		withArena($.model, (arena) => {
			const ticked = UiStruct.evolve(arena, { nowMs });
			const isClosed = Option.exists(
				arena.maybeView,
				(view) =>
					view.phase === "over" && view.deadlineAt !== null && nowMs - arena.clockOffsetMs > view.deadlineAt + CLOSE_GRACE_MS,
			);
			if (isClosed) return $.combine(($) => $.evolve({ screen: arenaScreen(ticked) }), goHome);
			return $.evolve({ screen: arenaScreen(ticked) }).run(...playCues(Option.toArray(countdownCue(arena, ticked))));
		}),
	),
	ClickedCritter: PalmonDef.update("ClickedCritter", ($, { critter }) =>
		withArena($.model, (arena) =>
			$.evolve({ screen: arenaScreen(UiStruct.evolve(arena, { isPicking: true })) }).run(
				PickCritter.make({ code: arena.code, profile: $.model.profile, critter }),
				PlayCues.make({ cues: critter === "sus" ? [cue("pick"), cue("susSting", 0, 120)] : [cue("pick")] }),
			),
		),
	),
	// The card lifts at once. The server's view confirms it.
	ClickedCard: PalmonDef.update("ClickedCard", ($, { card }) =>
		withArena($.model, (arena) =>
			$.evolve({
				screen: arenaScreen(
					UiStruct.evolve(arena, { maybeHand: Option.map((hand) => UiStruct.evolve(hand, { played: card })) }),
				),
			}).run(PlayCard.make({ code: arena.code, profile: $.model.profile, card }), PlayCues.make({ cues: [cue("flip")] })),
		),
	),
	SucceededSendMove: PalmonDef.update("SucceededSendMove", ($) =>
		withArena($.model, (arena) => $.evolve({ screen: arenaScreen(UiStruct.evolve(arena, { isPicking: false })) })),
	),
	// The hand may have changed under the click, so read it again.
	FailedSendMove: PalmonDef.update("FailedSendMove", ($, { reason }) =>
		withArena($.model, (arena) =>
			$.combine(
				($) =>
					$.evolve({ screen: arenaScreen(UiStruct.evolve(arena, { isPicking: false })) }).run(
						FetchHand.make({ code: arena.code, profile: $.model.profile }),
					),
				showNotice(MOVE_REFUSED_TEXT[reason] ?? "Try again"),
			),
		),
	),
	ClickedPeek: PalmonDef.update("ClickedPeek", ($) =>
		withArena($.model, (arena) =>
			$.evolve({ screen: arenaScreen(UiStruct.evolve(arena, { peek: Peek.Trying() })) }).run(
				PeekHand.make({ code: arena.code }),
			),
		),
	),
	CompletedPeekHand: PalmonDef.update("CompletedPeekHand", ($, { isRefused }) =>
		withArena($.model, (arena) =>
			$.evolve({
				screen: arenaScreen(UiStruct.evolve(arena, { peek: isRefused ? Peek.Refused() : Peek.Idle() })),
			}).run(...playCues(isRefused ? [cue("nope")] : [])),
		),
	),
	ClickedCopyLink: PalmonDef.update("ClickedCopyLink", ($) =>
		withArena($.model, (arena) => $.combine(($) => $.run(CopyLink.make({ code: arena.code })), showNotice("Link copied"))),
	),
	ClickedLeave: PalmonDef.update("ClickedLeave", ($) => $.combine(goHome)),
};
