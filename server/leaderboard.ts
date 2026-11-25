//! The results of finished battles. Rooms write here as they are destroyed.
import { db } from "@rivetkit/effect";
import { Effect, Schema } from "effect";
import { SqlSchema } from "effect/sql";
import { FighterResult, GameResult, Leaderboard, ResultRecorded } from "../shared/api.ts";

/** The Hall shows this many results, and the table keeps only this many. */
export const RECENT_LIMIT = 8;

/** A result row. Its fighters are stored as JSON text. */
const ResultRow = GameResult.mapFields((fields) => ({
	...fields,
	fighters: Schema.fromJsonString(Schema.toCodecJson(Schema.Array(FighterResult))),
})).pipe(Schema.encodeKeys({ finishedAt: "finished_at" }));

export const LeaderboardLive = Leaderboard.toLayer(
	Effect.gen(function* () {
		const sql = yield* Leaderboard.sql;
		const events = yield* Leaderboard.events;

		// A room records once. A repeated call keeps the first row.
		const insertRow = SqlSchema.void({
			Request: ResultRow,
			execute: (row) => sql`
				INSERT INTO results (code, finished_at, turns, winner, fighters)
				VALUES (${row.code}, ${row.finished_at}, ${row.turns}, ${row.winner}, ${row.fighters})
				ON CONFLICT (code) DO NOTHING
			`,
		});

		// The one shared leaderboard would otherwise grow with every battle ever played.
		const pruneOldRows = sql`
			DELETE FROM results WHERE code NOT IN (
				SELECT code FROM results ORDER BY finished_at DESC, code DESC LIMIT ${RECENT_LIMIT}
			)
		`;

		const insertResult = (result: GameResult) =>
			insertRow(result).pipe(Effect.andThen(pruneOldRows), sql.withTransaction);

		const recentResults = SqlSchema.findAll({
			Request: Schema.Void,
			Result: ResultRow,
			execute: () =>
				sql`SELECT code, finished_at, turns, winner, fighters FROM results ORDER BY finished_at DESC, code DESC LIMIT ${RECENT_LIMIT}`,
		});

		return Leaderboard.of({
			RecordResult: Effect.fn("Leaderboard.RecordResult")(function* ({ payload }) {
				yield* insertResult(payload);
				yield* events.broadcast(ResultRecorded, payload);
			}, Effect.orDie),

			RecentResults: Effect.fn("Leaderboard.RecentResults")(function* () {
				return yield* recentResults(undefined);
			}, Effect.orDie),
		});
	}),
	{
		db: db(),
		onMigrate: () =>
			Effect.gen(function* () {
				const sql = yield* Leaderboard.sql;
				yield* sql`
					CREATE TABLE IF NOT EXISTS results (
						code TEXT PRIMARY KEY,
						finished_at INTEGER NOT NULL,
						turns INTEGER NOT NULL,
						winner TEXT,
						fighters TEXT NOT NULL
					)
				`;
				// Added after the first release. Existing tables get it on their next start.
				yield* sql`CREATE INDEX IF NOT EXISTS results_finished_at ON results (finished_at)`;
			}).pipe(Effect.orDie),
		name: "Leaderboard",
		icon: "trophy",
	},
);
