import { UiSchema } from "@effect/ui";
import { Schema } from "effect";
import { Card, Critter, GameResult, HandView, RoomRefused, RoomView } from "../../shared/api.ts";

export const Message = UiSchema.TaggedEnum({
	// Page
	InteractedWithPage: {},
	ToggledSound: { pressed: Schema.Boolean },
	ToggledMusic: { pressed: Schema.Boolean },
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
	ClickedLeave: {},
});
export type Message = typeof Message.Type;
