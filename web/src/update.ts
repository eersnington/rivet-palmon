import type { Client } from "@rivetkit/effect";
import { Array, Option } from "effect";
import { Update } from "foldkit";
import { modifyFields } from "foldkit/struct";
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
	SetEffects,
	SetMusic,
	WaitBeforeHidingNotice,
} from "./command.ts";
import { CLOSE_GRACE_MS, CODE_LENGTH, RECENT_LIMIT } from "./constant.ts";
import { Message } from "./message.ts";
import { type Arena, maybeArenaOf, type Model, newArena, Peek, Screen } from "./model.ts";
import { musicMoodOf } from "./music/mood.ts";
import { countdownCue, roomChangeCues } from "./room-cues.ts";
import { type Cue, cue, type SpeakerService } from "./sound.ts";

type UpdateReturn = Update.Return<Model, Message, Client.Client | SpeakerService>;
type UpdateStep = Update.Step<Model, Message, Client.Client | SpeakerService>;

// STEPS

const showNotice =
	(text: string): UpdateStep =>
	(model) => {
		const id = model.noticeCount + 1;
		return {
			model: modifyFields(model, { maybeNotice: () => Option.some({ id, text }), noticeCount: () => id }),
			commands: [WaitBeforeHidingNotice({ id })],
		};
	};

const playCues =
	(cues: ReadonlyArray<Cue>): UpdateStep =>
	(model) =>
		Array.match(cues, {
			onEmpty: () => ({ model }),
			onNonEmpty: (nonEmptyCues) => ({ model, commands: [PlayCues({ cues: nonEmptyCues })] }),
		});

const enterArena =
	(code: string, role: Role): UpdateStep =>
	(model) => ({
		model: modifyFields(model, {
			screen: () => Screen.Arena({ arena: newArena(code, role) }),
			codeInput: () => code,
			isCreatingRoom: () => false,
		}),
		commands: [SaveSeat({ seat: { code, role } })],
	});

/** Opens a room for this player: for a friend, or with a computer trainer when `solo`. */
const createRoom = (model: Model, solo: boolean): UpdateReturn =>
	model.profile.name.trim() === ""
		? showNotice("Name first")(model)
		: {
				model: modifyFields(model, { isCreatingRoom: () => true }),
				commands: [CreateRoom({ profile: { playerId: model.profile.playerId, name: model.profile.name.trim() }, solo })],
			};

const goHome: UpdateStep = (model) => ({
	model: modifyFields(model, { screen: () => Screen.Home(), isCreatingRoom: () => false }),
	commands: [ClearSeat()],
});

const withArena = (model: Model, onArena: (arena: Arena) => UpdateReturn): UpdateReturn =>
	Option.match(maybeArenaOf(model), { onNone: () => ({ model }), onSome: onArena });

const writeArena = (model: Model, arena: Arena): Model =>
	modifyFields(model, { screen: () => Screen.Arena({ arena }) });

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

/** Every update that changes what the music should play tells the music, which moves on its next bar line. */
export const update = (model: Model, message: Message): UpdateReturn => {
	const result = updateModel(model, message);
	const mood = musicMoodOf(result.model);
	// A new speaker has no music yet, so it gets the mood even when the mood is unchanged.
	const isNewSpeaker = message._tag === "AcquiredSpeaker";
	if (!isNewSpeaker && mood === musicMoodOf(model)) return result;
	return { ...result, commands: [...(result.commands ?? []), SetMusic({ mood })] };
};

const updateModel = (model: Model, message: Message) =>
	Message.match<UpdateReturn>(message, {
		// Page

		InteractedWithPage: () => ({ model: modifyFields(model, { hasInteracted: () => true }) }),
		ClickedMute: () => {
			const isSoundOn = !model.isSoundOn;
			return {
				model: modifyFields(model, { isSoundOn: () => isSoundOn }),
				commands: [SaveMuted({ isMuted: !isSoundOn }), SetEffects({ isOn: isSoundOn })],
			};
		},
		ClickedMusic: () => {
			const isMusicOn = !model.isMusicOn;
			return {
				model: modifyFields(model, { isMusicOn: () => isMusicOn }),
				commands: [SaveMusicOff({ isMusicOff: !isMusicOn })],
			};
		},
		CompletedSaveMusicOff: () => ({ model }),
		CompletedSetMusic: () => ({ model }),
		CompletedSetEffects: () => ({ model }),
		// A new speaker starts with effects on and no music, so it gets both switches.
		AcquiredSpeaker: () => ({ model, commands: [SetEffects({ isOn: model.isSoundOn })] }),
		ReleasedSpeaker: () => ({ model }),
		FailedAcquireSpeaker: () => ({ model }),
		CompletedPlayCues: () => ({ model }),
		CompletedSaveProfile: () => ({ model }),
		CompletedSaveMuted: () => ({ model }),
		CompletedWaitBeforeHidingNotice: ({ id }) => ({
			model: Option.exists(model.maybeNotice, (notice) => notice.id === id)
				? modifyFields(model, { maybeNotice: () => Option.none() })
				: model,
		}),

		// Home

		UpdatedName: ({ name }) => {
			const profile = modifyFields(model.profile, { name: () => name.slice(0, MAX_NAME_LENGTH) });
			return { model: modifyFields(model, { profile: () => profile }), commands: [SaveProfile({ profile })] };
		},
		UpdatedCode: ({ code }) => ({ model: modifyFields(model, { codeInput: () => normalizeCode(code) }) }),
		ClickedNewBattle: () => createRoom(model, false),
		ClickedSolo: () => createRoom(model, true),
		ClickedJoin: () => {
			if (model.profile.name.trim() === "") return showNotice("Name first")(model);
			if (model.codeInput.length !== CODE_LENGTH) return showNotice("4-letter code")(model);
			return enterArena(model.codeInput, "player")(model);
		},
		ClickedWatch: () =>
			model.codeInput.length !== CODE_LENGTH
				? showNotice("4-letter code")(model)
				: enterArena(model.codeInput, "spectator")(model),
		SucceededCreateRoom: ({ code }) => enterArena(code, "player")(model),
		FailedCreateRoom: () =>
			showNotice("Could not open a room")(modifyFields(model, { isCreatingRoom: () => false })),
		UpdatedRecentResults: ({ results }) => ({ model: modifyFields(model, { recent: () => results }) }),
		RecordedResult: ({ result }) => ({
			model: modifyFields(model, {
				recent: (recent) =>
					Array.take([result, ...recent.filter((entry) => entry.code !== result.code)], RECENT_LIMIT),
			}),
		}),

		// Arena

		CompletedSaveSeat: () => ({ model }),
		CompletedClearSeat: () => ({ model }),

		// Views can arrive out of order, so keep the one with the highest `seq`.
		UpdatedRoomView: ({ view, receivedAtMs }) =>
			withArena(model, (arena) => {
				const isNewer = Option.match(arena.maybeView, {
					onNone: () => true,
					onSome: (current) => current.code !== view.code || view.seq >= current.seq,
				});
				if (!isNewer) return { model: writeArena(model, modifyFields(arena, { isLive: () => true })) };

				const cues = Option.match(arena.maybeView, {
					onNone: () => [],
					onSome: (before) => roomChangeCues(arena, model.profile.playerId, before, view, model.isMusicOn),
				});
				const nextArena = modifyFields(arena, {
					maybeView: () => Option.some(view),
					clockOffsetMs: () => receivedAtMs - view.sentAt,
					nowMs: () => receivedAtMs,
					isLive: () => true,
				});
				// A hand sent while this tab reconnected is lost, so ask for it.
				const isHandMissing =
					arena.role === "player" &&
					view.phase === "pick" &&
					!Option.exists(arena.maybeHand, (hand) => hand.turn === view.turn);
				return Update.combine(writeArena(model, nextArena), [
					(stepModel) =>
						isHandMissing
							? { model: stepModel, commands: [FetchHand({ code: view.code, profile: model.profile })] }
							: { model: stepModel },
					playCues(cues),
				]);
			}),
		UpdatedHand: ({ maybeHand }) =>
			withArena(model, (arena) => {
				const isOlder = Option.exists(maybeHand, (hand) =>
					Option.exists(arena.maybeHand, (current) => current.turn > hand.turn),
				);
				return Option.isNone(maybeHand) || isOlder
					? { model }
					: { model: writeArena(model, modifyFields(arena, { maybeHand: () => maybeHand })) };
			}),
		// A full room or a fight that started still lets you watch.
		RefusedSeat: ({ reason }) =>
			withArena(model, (arena) =>
				reason === "name"
					? Update.combine(model, [goHome, showNotice("Name first")])
					: Update.combine(model, [
							enterArena(arena.code, "spectator"),
							showNotice(reason === "full" ? "Room is full. Watching." : "Already fighting. Watching."),
						]),
			),
		DisappearedRoom: () =>
			withArena(model, (arena) =>
				Option.exists(arena.maybeView, (view) => view.phase === "over")
					? goHome(model)
					: Update.combine(model, [goHome, showNotice(`No room ${arena.code}`)]),
			),
		LostRoomConnection: () =>
			withArena(model, (arena) => ({ model: writeArena(model, modifyFields(arena, { isLive: () => false })) })),

		// The room destroys itself when the result's time is up, so go home then.
		TickedClock: ({ nowMs }) =>
			withArena(model, (arena) => {
				const ticked = modifyFields(arena, { nowMs: () => nowMs });
				const isClosed = Option.exists(
					arena.maybeView,
					(view) =>
						view.phase === "over" && view.deadlineAt !== null && nowMs - arena.clockOffsetMs > view.deadlineAt + CLOSE_GRACE_MS,
				);
				if (isClosed) return goHome(writeArena(model, ticked));
				return playCues(Option.toArray(countdownCue(arena, ticked)))(writeArena(model, ticked));
			}),
		ClickedCritter: ({ critter }) =>
			withArena(model, (arena) => ({
				model: writeArena(model, modifyFields(arena, { isPicking: () => true })),
				commands: [
					PickCritter({ code: arena.code, profile: model.profile, critter }),
					PlayCues({ cues: critter === "sus" ? [cue("pick"), cue("susSting", 0, 120)] : [cue("pick")] }),
				],
			})),
		// The card lifts at once. The server's view confirms it.
		ClickedCard: ({ card }) =>
			withArena(model, (arena) => ({
				model: writeArena(
					model,
					modifyFields(arena, {
						maybeHand: Option.map((hand) => modifyFields(hand, { played: () => card })),
					}),
				),
				commands: [PlayCard({ code: arena.code, profile: model.profile, card }), PlayCues({ cues: [cue("flip")] })],
			})),
		SucceededSendMove: () =>
			withArena(model, (arena) => ({ model: writeArena(model, modifyFields(arena, { isPicking: () => false })) })),
		// The hand may have changed under the click, so read it again.
		FailedSendMove: ({ reason }) =>
			withArena(model, (arena) =>
				Update.combine(writeArena(model, modifyFields(arena, { isPicking: () => false })), [
					(stepModel) => ({ model: stepModel, commands: [FetchHand({ code: arena.code, profile: model.profile })] }),
					showNotice(MOVE_REFUSED_TEXT[reason] ?? "Try again"),
				]),
			),
		ClickedPeek: () =>
			withArena(model, (arena) => ({
				model: writeArena(model, modifyFields(arena, { peek: () => Peek.Trying() })),
				commands: [PeekHand({ code: arena.code })],
			})),
		CompletedPeekHand: ({ isRefused }) =>
			withArena(model, (arena) =>
				playCues(isRefused ? [cue("nope")] : [])(
					writeArena(model, modifyFields(arena, { peek: () => (isRefused ? Peek.Refused() : Peek.Idle()) })),
				),
			),
		ClickedCopyLink: () =>
			withArena(model, (arena) =>
				Update.combine(model, [
					(stepModel) => ({ model: stepModel, commands: [CopyLink({ code: arena.code })] }),
					showNotice("Link copied"),
				]),
			),
		CompletedCopyLink: () => ({ model }),
		ClickedLeave: () => goHome(model),
	});
