import { Registry } from "@rivetkit/effect";
import { Duration, Effect, Fiber, Layer, Option, Schedule, Stream } from "effect";
import { expect, test } from "vitest";
import { ActorsLive } from "../server/actors.ts";
import { RECENT_LIMIT } from "../server/leaderboard.ts";
import { type GameResult, type JoinParams, LEADERBOARD_KEY, Leaderboard, Room, type RoomView, type Settings } from "../shared/api.ts";

const TestLayer = Registry.test.pipe(
	Layer.provideMerge(ActorsLive),
	Layer.provide(Registry.layer({ startServices: false, runtime: "native" })),
);

/** Short phases, so the timers fire during the test. */
const FAST: Settings = { maxTurns: 2, turnSeconds: 1.5, revealSeconds: 0.5, closeSeconds: 0.5, solo: false };

const WAIT = Duration.seconds(30);

const player = (name: string): JoinParams => ({ role: "player", playerId: crypto.randomUUID(), name });
const spectator = (): JoinParams => ({ role: "spectator", playerId: crypto.randomUUID(), name: "" });

const joinWithin = <A, E>(fiber: Fiber.Fiber<A, E>) => Fiber.join(fiber).pipe(Effect.timeout(WAIT));

/** Test mode opens each actor's inspector with this token. */
const INSPECTOR_TOKEN = "token";

/** Counts the rows the leaderboard actor really stores, through its inspector's database route. */
const countStoredResults = Effect.gen(function* () {
	const leaderboards = yield* Leaderboard.client;
	const response = yield* leaderboards.getOrCreate(LEADERBOARD_KEY).fetch("/inspector/database/execute", {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Bearer ${INSPECTOR_TOKEN}` },
		body: JSON.stringify({ sql: "SELECT count(*) AS stored FROM results" }),
	});
	const body = (yield* Effect.promise(() => response.json())) as { rows: Array<{ stored: number }> };
	return body.rows[0]?.stored;
});

test("hands reach players and never spectators, the turn timer plays for idle players, and the result outlives the room", () =>
	Effect.gen(function* () {
		const rooms = yield* Room.client;
		const leaderboards = yield* Leaderboard.client;
		const code = crypto.randomUUID().slice(0, 8).toUpperCase();
		const ana = player("Ana");
		const ben = player("Ben");

		// The leaderboard listens before the fight starts.
		const board = yield* leaderboards.getOrCreate(LEADERBOARD_KEY).connect;
		const recorded = yield* board.events.ResultRecorded.pipe(
			Stream.filter((result) => result.code === code),
			Stream.runHead,
			Effect.forkScoped({ startImmediately: true }),
		);

		// Two players and two spectators connect at the same time.
		yield* rooms.create(code, { input: FAST, params: ana });
		const [anaConn, benConn, watcher, peeker] = yield* Effect.all(
			[ana, ben, spectator(), spectator()].map((params) => rooms.get(code, { params }).connect),
			{ concurrency: "unbounded" },
		);

		const hands = yield* Effect.forEach([anaConn, benConn], (conn) =>
			conn.events.Hand.pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped({ startImmediately: true })),
		);
		const watched = yield* watcher.events.RoomChanged.pipe(
			Stream.takeUntil((view) => view.phase === "over"),
			Stream.runCollect,
			Effect.forkScoped({ startImmediately: true }),
		);

		// A spectator that listens for hands is refused, and cannot ask for one either.
		const refused = yield* peeker.events.Hand.pipe(Stream.runDrain, Effect.flip, Effect.timeout(WAIT));
		expect(refused.reason._tag).toBe("Forbidden");
		const asked = yield* rooms.get(code, { params: spectator() }).GetHand().pipe(Effect.flip);
		expect(asked).toMatchObject({ _tag: "MoveRejected", reason: "not_a_player" });

		// Both seats are taken, so a third player is turned away.
		const third = yield* rooms.get(code, { params: player("Cai") }).connect.pipe(Effect.flip);
		expect(third).toMatchObject({ _tag: "RoomRefused", reason: "full" });

		// The fight starts when both have a critter. Nobody plays turn 1, so the
		// timer has to play for both. Turn 2 starts only after that.
		yield* Effect.all([anaConn.PickCritter({ critter: "zip" }), benConn.PickCritter({ critter: "blub" })], {
			concurrency: "unbounded",
		});
		const [anaHands, benHands] = yield* Effect.forEach(hands, joinWithin);
		for (const received of [anaHands, benHands]) {
			expect(received?.map((hand) => hand.turn)).toEqual([1, 2]);
			for (const hand of received ?? []) expect(hand.cards).toHaveLength(3);
		}

		// In turn 2 both play their first card, which ends the turn at once.
		const anaCard = anaHands![1]!.cards[0]!;
		const benCard = benHands![1]!.cards[0]!;
		yield* Effect.all([anaConn.Play({ card: anaCard }), benConn.Play({ card: benCard })], {
			concurrency: "unbounded",
		});

		const views = yield* joinWithin(watched);
		for (const view of views.filter((entry) => entry.phase === "pick")) {
			expect(view.plays).toEqual([]);
			expect(JSON.stringify(view)).not.toContain("cards");
		}
		const turn1 = views.find((view) => view.phase === "reveal" && view.turn === 1);
		expect(turn1?.plays.map((play) => play.auto)).toEqual([true, true]);
		const turn2 = views.find((view) => view.phase === "reveal" && view.turn === 2);
		expect(turn2?.plays.find((play) => play.playerId === ana.playerId)).toMatchObject({ card: anaCard, auto: false });
		expect(turn2?.plays.find((play) => play.playerId === ben.playerId)).toMatchObject({ card: benCard, auto: false });
		const over = views.at(-1);
		expect(over?.phase).toBe("over");

		// The room destroys itself, and its result is on the leaderboard.
		const result = Option.getOrThrow(yield* joinWithin(recorded));
		const finalHp = new Map(over?.fighters.map((fighter) => [fighter.name, fighter.hp]));
		expect([...result.fighters].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
			{ name: "Ana", critter: "zip", hp: finalHp.get("Ana") },
			{ name: "Ben", critter: "blub", hp: finalHp.get("Ben") },
		]);
		const winner = over?.fighters.find((fighter) => fighter.id === over.winnerId);
		expect(result.winner).toBe(winner?.name ?? null);
		const recent = yield* leaderboards.getOrCreate(LEADERBOARD_KEY).RecentResults();
		expect(recent.map((entry) => entry.code)).toContain(code);

		// The destroy finishes after `onDestroy` returns, so wait for the room to be gone.
		const gone = yield* rooms
			.get(code, { params: spectator() })
			.GetRoom()
			.pipe(Effect.flip, Effect.retry({ schedule: Schedule.spaced("200 millis"), times: 50 }));
		expect(gone._tag === "RivetError" && gone.reason._tag).toBe("ActorNotFound");
	}).pipe(Effect.scoped, Effect.provide(TestLayer), Effect.runPromise));

test("the leaderboard stores only the newest results, however many battles finish", () =>
	Effect.gen(function* () {
		const board = (yield* Leaderboard.client).getOrCreate(LEADERBOARD_KEY);
		const finished = Array.from({ length: RECENT_LIMIT + 3 }, (_, index): GameResult => ({
			code: crypto.randomUUID().slice(0, 8).toUpperCase(),
			finishedAt: Date.now() + index,
			turns: 1,
			winner: null,
			fighters: [],
		}));
		// Rooms finish at the same time, so their results arrive together.
		yield* Effect.forEach(finished, (result) => board.RecordResult(result), { concurrency: "unbounded" });

		expect(yield* countStoredResults).toBeLessThanOrEqual(RECENT_LIMIT);
		const recent = yield* board.RecentResults();
		expect(recent.map((result) => result.code)).toEqual(finished.slice(-RECENT_LIMIT).reverse().map((result) => result.code));
	}).pipe(Effect.scoped, Effect.provide(TestLayer), Effect.runPromise));

test("in a solo room the computer trainer picks every turn before the person's card exists, until the fight ends", () =>
	Effect.gen(function* () {
		const rooms = yield* Room.client;
		const code = crypto.randomUUID().slice(0, 8).toUpperCase();
		const ana = player("Ana");
		// The trainer thinks for under half a turn, which leaves time to answer.
		const solo: Settings = { maxTurns: 4, turnSeconds: 3, revealSeconds: 0.5, closeSeconds: 0.5, solo: true };
		yield* rooms.create(code, { input: solo, params: ana });
		const anaConn = yield* rooms.get(code, { params: ana }).connect;

		// Nobody can take the trainer's seat.
		const impostor = yield* rooms.get(code, { params: { role: "player", playerId: "cpu", name: "Eve" } }).connect.pipe(Effect.flip);
		expect(impostor).toMatchObject({ _tag: "RoomRefused" });

		// Ana plays each turn only once the trainer has locked in. Until then her card does not exist
		// anywhere in the room, so the trainer's pick cannot depend on it.
		const playedTurns = new Set<number>();
		const reveals = new Map<number, RoomView>();
		const watched = yield* anaConn.events.RoomChanged.pipe(
			Stream.takeUntil((view) => view.phase === "over"),
			Stream.runForEach((view) =>
				Effect.gen(function* () {
					if (view.phase === "reveal") reveals.set(view.turn, view);
					const trainer = view.fighters.find((fighter) => fighter.isCpu);
					if (view.phase !== "pick" || trainer?.locked !== true || playedTurns.has(view.turn)) return;
					playedTurns.add(view.turn);
					const hand = yield* anaConn.GetHand();
					if (hand !== null && hand.played === null) yield* anaConn.Play({ card: hand.cards[0] });
				}),
			),
			Effect.forkScoped({ startImmediately: true }),
		);

		yield* anaConn.PickCritter({ critter: "zip" });
		yield* joinWithin(watched);

		const over = yield* anaConn.GetRoom();
		expect(over.phase).toBe("over");
		const trainer = over.fighters.find((fighter) => fighter.isCpu);
		expect(trainer?.critter).not.toBeNull();
		expect(reveals.size).toBe(over.turn);
		for (const view of reveals.values()) {
			// The trainer picked every turn itself, never the timer, and Ana played after it.
			expect(view.plays.find((play) => play.playerId === trainer?.id)?.auto).toBe(false);
			expect(view.plays.find((play) => play.playerId === ana.playerId)?.auto).toBe(false);
		}
		expect([...playedTurns]).toEqual(Array.from({ length: over.turn }, (_, index) => index + 1));
	}).pipe(Effect.scoped, Effect.provide(TestLayer), Effect.runPromise));
