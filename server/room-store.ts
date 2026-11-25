//! The SQLite tables of one room, and every read and write of them. Rows are
//! decoded with Schema here, so the room actor only sees parsed values.
import { Clock, Effect, Schema, SchemaGetter, SchemaTransformation } from "effect";
import { SqlSchema } from "effect/sql";
import { Card, Critter, MAX_HP, Phase, Room, type Settings } from "../shared/api.ts";
import { CPU_ID, cpuTrainer } from "./cpu.ts";

/** The room's settings and where the fight is. There is one row. */
export const RoomRecord = Schema.Struct({
	maxTurns: Schema.Number,
	turnMs: Schema.Number,
	revealMs: Schema.Number,
	closeMs: Schema.Number,
	phase: Phase,
	turn: Schema.Number,
	deadlineAt: Schema.NullOr(Schema.Number),
	seq: Schema.Number,
	winnerId: Schema.NullOr(Schema.String),
	/** The computer trainer's seat in a solo room. */
	cpuId: Schema.NullOr(Schema.String),
}).pipe(
	Schema.encodeKeys({
		maxTurns: "max_turns",
		turnMs: "turn_ms",
		revealMs: "reveal_ms",
		closeMs: "close_ms",
		deadlineAt: "deadline_at",
		winnerId: "winner_id",
		cpuId: "cpu_id",
	}),
);
export type RoomRecord = typeof RoomRecord.Type;

/** A seat. `critter` is `null` until the player picks one in the lobby. */
export const FighterRecord = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	critter: Schema.NullOr(Critter),
	hp: Schema.Number,
});
export type FighterRecord = typeof FighterRecord.Type;

/** A hand is stored as its cards joined by commas. */
const CardList = Schema.String.pipe(
	Schema.decodeTo(Schema.Array(Schema.String), {
		decode: SchemaGetter.split(),
		encode: SchemaGetter.transform((cards: ReadonlyArray<string>) => cards.join(",")),
	}),
	Schema.decodeTo(Schema.NonEmptyArray(Card), SchemaTransformation.passthroughSupertype()),
);

/** A player's hand in one turn, and what it did once played. */
export const HandRecord = Schema.Struct({
	playerId: Schema.String,
	cards: CardList,
	played: Schema.NullOr(Card),
	auto: Schema.BooleanFromBit,
	damage: Schema.Number,
	healed: Schema.Number,
}).pipe(Schema.encodeKeys({ playerId: "player_id" }));
export type HandRecord = typeof HandRecord.Type;

/** How long `phase` lasts in total. */
export const phaseMs = (room: RoomRecord) => {
	switch (room.phase) {
		case "lobby":
			return 0;
		case "pick":
			return room.turnMs;
		case "reveal":
			return room.revealMs;
		case "over":
			return room.closeMs;
	}
};


/**
 * The store of the room the caller runs in. Storage errors are defects: the
 * database is local to the actor, so a failed statement cannot be retried.
 */
export const makeRoomStore = Effect.gen(function* () {
	const sql = yield* Room.sql;

	const readRoomRow = SqlSchema.findOne({
		Request: Schema.Void,
		Result: RoomRecord,
		execute: () => sql`SELECT * FROM room WHERE id = 1`,
	});

	const readFightersRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: FighterRecord,
		execute: () => sql`SELECT id, name, critter, hp FROM fighters ORDER BY joined_at, id`,
	});

	const readHandsRows = SqlSchema.findAll({
		Request: Schema.Number,
		Result: HandRecord,
		execute: (turn) => sql`SELECT player_id, cards, played, auto, damage, healed FROM hands WHERE turn = ${turn}`,
	});

	const readHandRow = SqlSchema.findOneOption({
		Request: Schema.Struct({ turn: Schema.Number, playerId: Schema.String }),
		Result: HandRecord,
		execute: ({ turn, playerId }) =>
			sql`SELECT player_id, cards, played, auto, damage, healed FROM hands WHERE turn = ${turn} AND player_id = ${playerId}`,
	});

	const encodeCards = Schema.encodeEffect(CardList);

	const readPlayedRows = SqlSchema.findAll({
		Request: Schema.Struct({ beforeTurn: Schema.Number, playerId: Schema.String }),
		Result: Schema.Struct({ played: Card }),
		execute: ({ beforeTurn, playerId }) =>
			sql`SELECT played FROM hands WHERE turn < ${beforeTurn} AND player_id = ${playerId} AND played IS NOT NULL ORDER BY turn`,
	});

	return {
		/** Runs `effect` in one transaction. */
		transaction: sql.withTransaction,

		readRoom: readRoomRow(undefined).pipe(Effect.orDie),
		readFighters: readFightersRows(undefined).pipe(Effect.orDie),
		readHands: (turn: number) => readHandsRows(turn).pipe(Effect.orDie),
		readHand: (turn: number, playerId: string) => readHandRow({ turn, playerId }).pipe(Effect.orDie),
		/** The cards a player played in turns before `beforeTurn`. Those turns are all revealed. */
		readPastPlays: (beforeTurn: number, playerId: string) =>
			readPlayedRows({ beforeTurn, playerId }).pipe(
				Effect.map((rows) => rows.map((row) => row.played)),
				Effect.orDie,
			),

		isSeated: (playerId: string) =>
			sql`SELECT id FROM fighters WHERE id = ${playerId}`.pipe(
				Effect.map((rows) => rows.length > 0),
				Effect.orDie,
			),

		/** Bumps `seq`, so clients can drop older views. */
		bumpSeq: sql`UPDATE room SET seq = seq + 1 WHERE id = 1`.pipe(Effect.asVoid, Effect.orDie),

		/**
		 * Moves the room from `from` in `turn` to `to` in `nextTurn`. Only one
		 * caller wins, so a timer and the last card cannot both move it.
		 */
		claim: (turn: number, from: Phase, to: Phase, nextTurn: number, deadlineAt: number) =>
			sql<{ turn: number }>`
				UPDATE room SET phase = ${to}, turn = ${nextTurn}, deadline_at = ${deadlineAt}
				WHERE id = 1 AND phase = ${from} AND turn = ${turn}
				RETURNING turn
			`.pipe(
				Effect.map((rows) => rows.length > 0),
				Effect.orDie,
			),

		setWinner: (winnerId: string | null) => sql`UPDATE room SET winner_id = ${winnerId} WHERE id = 1`.pipe(Effect.asVoid, Effect.orDie),

		seat: (playerId: string, name: string, hp: number) =>
			Effect.gen(function* () {
				const joinedAt = yield* Clock.currentTimeMillis;
				yield* sql`INSERT INTO fighters (id, name, hp, joined_at) VALUES (${playerId}, ${name}, ${hp}, ${joinedAt})`;
			}).pipe(Effect.orDie),

		unseat: (playerId: string) => sql`DELETE FROM fighters WHERE id = ${playerId}`.pipe(Effect.asVoid, Effect.orDie),

		setCritter: (playerId: string, critter: Critter) =>
			sql`UPDATE fighters SET critter = ${critter} WHERE id = ${playerId}`.pipe(Effect.asVoid, Effect.orDie),

		setHp: (playerId: string, hp: number) => sql`UPDATE fighters SET hp = ${hp} WHERE id = ${playerId}`.pipe(Effect.asVoid, Effect.orDie),

		deal: (turn: number, playerId: string, cards: readonly [Card, ...Array<Card>]) =>
			encodeCards(cards).pipe(
				Effect.flatMap((text) => sql`INSERT INTO hands (turn, player_id, cards) VALUES (${turn}, ${playerId}, ${text})`),
				Effect.asVoid,
				Effect.orDie,
			),

		/** Marks `card` as played by the player, before the reveal. */
		play: (turn: number, playerId: string, card: Card) =>
			sql`UPDATE hands SET played = ${card} WHERE turn = ${turn} AND player_id = ${playerId}`.pipe(Effect.asVoid, Effect.orDie),

		/** Stores what a played card did, in the reveal. */
		resolvePlay: (turn: number, playerId: string, play: { card: Card; auto: boolean; damage: number; healed: number }) =>
			sql`
				UPDATE hands SET played = ${play.card}, auto = ${play.auto ? 1 : 0}, damage = ${play.damage}, healed = ${play.healed}
				WHERE turn = ${turn} AND player_id = ${playerId}
			`.pipe(Effect.asVoid, Effect.orDie),
	};
});

/** Creates the tables. */
export const migrateRoom = Effect.gen(function* () {
	const sql = yield* Room.sql;
	yield* sql`
		CREATE TABLE IF NOT EXISTS room (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			max_turns INTEGER NOT NULL,
			turn_ms INTEGER NOT NULL,
			reveal_ms INTEGER NOT NULL,
			close_ms INTEGER NOT NULL,
			phase TEXT NOT NULL DEFAULT 'lobby',
			turn INTEGER NOT NULL DEFAULT 0,
			deadline_at INTEGER,
			seq INTEGER NOT NULL DEFAULT 0,
			winner_id TEXT,
			cpu_id TEXT
		)
	`;
	// Rooms created before solo mode have no cpu_id column.
	const columns = yield* sql<{ name: string }>`SELECT name FROM pragma_table_info('room')`;
	if (!columns.some((column) => column.name === "cpu_id")) yield* sql`ALTER TABLE room ADD COLUMN cpu_id TEXT`;
	yield* sql`
		CREATE TABLE IF NOT EXISTS fighters (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			critter TEXT,
			hp INTEGER NOT NULL,
			joined_at INTEGER NOT NULL
		)
	`;
	yield* sql`
		CREATE TABLE IF NOT EXISTS hands (
			turn INTEGER NOT NULL,
			player_id TEXT NOT NULL,
			cards TEXT NOT NULL,
			played TEXT,
			auto INTEGER NOT NULL DEFAULT 0,
			damage INTEGER NOT NULL DEFAULT 0,
			healed INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (turn, player_id)
		)
	`;
}).pipe(Effect.orDie);

/**
 * Stores the settings the room was created with. RivetKit does not keep an
 * actor's input. A solo room seats its computer trainer, creature picked, right away.
 */
export const createRoom = (settings: Settings) =>
	Effect.gen(function* () {
		const sql = yield* Room.sql;
		const ms = (seconds: number) => Math.round(seconds * 1000);
		const cpuId = settings.solo ? CPU_ID : null;
		yield* sql`
			INSERT INTO room (id, max_turns, turn_ms, reveal_ms, close_ms, cpu_id)
			VALUES (1, ${settings.maxTurns}, ${ms(settings.turnSeconds)}, ${ms(settings.revealSeconds)}, ${ms(settings.closeSeconds)}, ${cpuId})
		`;
		if (settings.solo) {
			const trainer = yield* cpuTrainer;
			const joinedAt = yield* Clock.currentTimeMillis;
			yield* sql`
				INSERT INTO fighters (id, name, critter, hp, joined_at)
				VALUES (${CPU_ID}, ${trainer.name}, ${trainer.critter}, ${MAX_HP}, ${joinedAt})
			`;
		}
	}).pipe(Effect.orDie);

