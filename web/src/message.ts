import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";
import { Card, Critter, GameResult, HandView, RoomRefused, RoomView } from "../../shared/api.ts";

export const Message = defineMessageUnion({
	// Page
	InteractedWithPage: {},
	ClickedMute: {},
	ClickedMusic: {},
	CompletedSaveMusicOff: {},
	CompletedSetMusic: {},
	CompletedSetEffects: {},
	AcquiredSpeaker: {},
	ReleasedSpeaker: {},
	FailedAcquireSpeaker: { error: Schema.String },
	CompletedPlayCues: {},
	CompletedSaveProfile: {},
	CompletedSaveMuted: {},
	CompletedWaitBeforeHidingNotice: { id: Schema.Number },

	// Home
	UpdatedName: { name: Schema.String },
	UpdatedCode: { code: Schema.String },
	ClickedNewBattle: {},
	ClickedSolo: {},
	ClickedJoin: {},
	ClickedWatch: {},
	SucceededCreateRoom: { code: Schema.String },
	FailedCreateRoom: { error: Schema.String },
	UpdatedRecentResults: { results: Schema.Array(GameResult) },
	RecordedResult: { result: GameResult },

	// Arena
	CompletedSaveSeat: {},
	CompletedClearSeat: {},
	UpdatedRoomView: { view: RoomView, receivedAtMs: Schema.Number },
	UpdatedHand: { maybeHand: Schema.Option(HandView) },
	RefusedSeat: { reason: RoomRefused.fields.reason },
	DisappearedRoom: {},
	LostRoomConnection: {},
	TickedClock: { nowMs: Schema.Number },
	ClickedCritter: { critter: Critter },
	ClickedCard: { card: Card },
	SucceededSendMove: {},
	FailedSendMove: { reason: Schema.String },
	ClickedPeek: {},
	CompletedPeekHand: { isRefused: Schema.Boolean },
	ClickedCopyLink: {},
	CompletedCopyLink: {},
	ClickedLeave: {},
});
export type Message = typeof Message.Type;
