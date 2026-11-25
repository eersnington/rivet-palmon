//! One battle room. Everything the fight needs after a restart or a sleep is
//! in its SQLite database, and every phase ends on a stored schedule.
import { Actor, db } from "@rivetkit/effect";
import { Array, Clock, Duration, Effect, Option, Random } from "effect";
import {
	type Card,
	Close,
	CpuPlay,
	EndPhase,
	HAND_SIZE,
	Hand,
	type HandView,
	type JoinParams,
	LEADERBOARD_KEY,
	Leaderboard,
	MAX_HP,
	MAX_NAME_LENGTH,
	MoveRejected,
	type Phase,
	Room,
	RoomChanged,
	RoomRefused,
	type RoomView,
} from "../shared/api.ts";
import { CARD_POOL, resolve } from "./battle-rules.ts";
import { CPU_ID, chooseCpuCard, cpuThinkMs } from "./cpu.ts";
import { createRoom, type HandRecord, makeRoomStore, migrateRoom, phaseMs } from "./room-store.ts";

const SEATS = 2;

const reject = (reason: MoveRejected["reason"]) => Effect.fail(new MoveRejected({ reason }));

export const RoomLive = Room.toLayer(
	Effect.gen(function* () {
		const store = yield* makeRoomStore;
		const events = yield* Room.events;
		const schedule = yield* Room.schedule;
		const connections = yield* Room.connections;
		const leaderboard = (yield* Leaderboard.client).getOrCreate(LEADERBOARD_KEY);
		const { key } = yield* Actor.CurrentAddress;
		const code = key[0] ?? "";

		// VIEWS

		/** The view everyone gets. It never holds a hand. */
		const readView = Effect.gen(function* () {
			const room = yield* store.readRoom;
			const fighters = yield* store.readFighters;
			const hands = yield* store.readHands(room.turn);
			const open = yield* connections.list;
			const sentAt = yield* Clock.currentTimeMillis;

			const online = new Set(open.filter(({ params }) => params.role === "player").map(({ params }) => params.playerId));
			if (room.cpuId !== null) online.add(room.cpuId);
			const lockedIds = new Set(hands.filter((hand) => hand.played !== null).map((hand) => hand.playerId));
			const showPlays = room.phase === "reveal" || room.phase === "over";

			const view: RoomView = {
				code,
				seq: room.seq,
				sentAt,
				phase: room.phase,
				turn: room.turn,
				maxTurns: room.maxTurns,
				deadlineAt: room.deadlineAt,
				phaseMs: phaseMs(room),
				fighters: fighters.map((fighter) => ({
					...fighter,
					online: online.has(fighter.id),
					locked: room.phase === "pick" && lockedIds.has(fighter.id),
					isCpu: fighter.id === room.cpuId,
				})),
				spectators: open.filter(({ params }) => params.role === "spectator").length,
				plays: showPlays
					? hands.flatMap((hand) =>
							hand.played === null
								? []
								: [{ playerId: hand.playerId, card: hand.played, auto: hand.auto, damage: hand.damage, healed: hand.healed }],
						)
					: [],
				winnerId: room.winnerId,
			};
			return view;
		});

		/** Bumps `seq` and sends the new view to everyone. */
		const publish = store.bumpSeq.pipe(
			Effect.andThen(readView),
			Effect.flatMap((view) => events.broadcast(RoomChanged, view)),
		);

		const handFor = (playerId: string) =>
			Effect.gen(function* () {
				const room = yield* store.readRoom;
				if (room.phase !== "pick" && room.phase !== "reveal") return null;
				const maybeHand = yield* store.readHand(room.turn, playerId);
				return Option.match(maybeHand, {
					onNone: () => null,
					onSome: (hand): HandView => ({ turn: room.turn, cards: hand.cards, played: hand.played }),
				});
			});

		/** Sends each seated player their own hand. Spectators get nothing. */
		const sendHands = Effect.gen(function* () {
			const open = yield* connections.list;
			yield* Effect.forEach(
				open.filter(({ params }) => params.role === "player"),
				(connection) =>
					handFor(connection.params.playerId).pipe(
						Effect.flatMap((hand) => (hand === null ? Effect.void : events.send(connection, Hand, hand))),
					),
				{ discard: true },
			);
		});

		// TRANSITIONS

		/** The timer that ends `phase`. A timer for a phase that already ended changes nothing. */
		const armTimer = (turn: number, phase: Phase, delayMs: number) => {
			const delay = Duration.millis(Math.max(0, delayMs));
			const scheduled = phase === "over" ? schedule.after(delay, Close) : schedule.after(delay, EndPhase, { turn, phase });
			return scheduled.pipe(Effect.asVoid, Effect.orDie);
		};

		const dealHands = (turn: number) =>
			Effect.gen(function* () {
				const fighters = yield* store.readFighters;
				yield* Effect.forEach(
					fighters,
					(fighter) =>
						Effect.gen(function* () {
							const cards = yield* Effect.replicateEffect(Random.choice(CARD_POOL), HAND_SIZE);
							if (!Array.isArrayNonEmpty(cards)) return yield* Effect.die("HAND_SIZE must be at least 1");
							yield* store.deal(turn, fighter.id, cards);
						}),
					{ discard: true },
				);
			});

		/** In a solo room, the computer trainer plays after a human-like pause, on the actor's schedule. */
		const armCpu = (turn: number) =>
			Effect.gen(function* () {
				const room = yield* store.readRoom;
				if (room.cpuId === null) return;
				const thinkMs = yield* cpuThinkMs(room.turnMs);
				yield* schedule.after(Duration.millis(thinkMs), CpuPlay, { turn }).pipe(Effect.asVoid, Effect.orDie);
			});

		/** Starts turn `fromTurn + 1` with new hands. */
		const startTurn = (from: Phase, fromTurn: number) =>
			Effect.gen(function* () {
				const room = yield* store.readRoom;
				const now = yield* Clock.currentTimeMillis;
				const turn = fromTurn + 1;
				if (!(yield* store.claim(fromTurn, from, "pick", turn, now + room.turnMs))) return false;
				yield* dealHands(turn);
				return true;
			}).pipe(
				store.transaction,
				Effect.orDie,
				Effect.flatMap((started) =>
					started
						? Effect.gen(function* () {
								const room = yield* store.readRoom;
								yield* armTimer(room.turn, "pick", room.turnMs);
								yield* armCpu(room.turn);
								yield* sendHands;
							})
						: Effect.void,
				),
			);

		/** The card each hand plays: the one its player chose, or a random one the timer picks. */
		const choosePlay = (hand: HandRecord) =>
			hand.played === null
				? Random.choice(hand.cards).pipe(Effect.map((card) => ({ playerId: hand.playerId, card, auto: true })))
				: Effect.succeed({ playerId: hand.playerId, card: hand.played, auto: false });

		/** Reveals the turn. Both cards resolve at once. */
		const toReveal = (turn: number) =>
			Effect.gen(function* () {
				const room = yield* store.readRoom;
				const now = yield* Clock.currentTimeMillis;
				if (!(yield* store.claim(turn, "pick", "reveal", turn, now + room.revealMs))) return false;

				const plays = yield* Effect.forEach(yield* store.readHands(turn), choosePlay);
				const fighters = yield* store.readFighters;
				yield* Effect.forEach(
					plays,
					(play) =>
						Effect.gen(function* () {
							const fighter = fighters.find((entry) => entry.id === play.playerId);
							const theirs = plays.find((entry) => entry.playerId !== play.playerId);
							if (fighter === undefined || theirs === undefined) return;
							const outcome = resolve(fighter.hp, play.card, theirs.card);
							yield* store.setHp(fighter.id, outcome.hp);
							yield* store.resolvePlay(turn, fighter.id, { ...play, damage: outcome.damage, healed: outcome.healed });
						}),
					{ discard: true },
				);
				return true;
			}).pipe(
				store.transaction,
				Effect.orDie,
				Effect.flatMap((revealed) =>
					revealed ? store.readRoom.pipe(Effect.flatMap((room) => armTimer(turn, "reveal", room.revealMs))) : Effect.void,
				),
			);

		/** After a reveal: the next turn, or the end when a critter faints or the turns run out. */
		const afterReveal = (turn: number) =>
			Effect.gen(function* () {
				const room = yield* store.readRoom;
				const fighters = yield* store.readFighters;
				const hasFainted = fighters.some((fighter) => fighter.hp === 0);
				if (!hasFainted && turn < room.maxTurns) return yield* startTurn("reveal", turn);

				const [first, second] = [...fighters].sort((a, b) => b.hp - a.hp);
				const winnerId = first !== undefined && second !== undefined && first.hp > second.hp ? first.id : null;
				const now = yield* Clock.currentTimeMillis;
				const hasEnded = yield* Effect.gen(function* () {
					if (!(yield* store.claim(turn, "reveal", "over", turn, now + room.closeMs))) return false;
					yield* store.setWinner(winnerId);
					return true;
				}).pipe(store.transaction, Effect.orDie);
				if (hasEnded) yield* armTimer(turn, "over", room.closeMs);
			});

		/** Starts the fight once both seats have a critter. */
		const startWhenReady = Effect.gen(function* () {
			const fighters = yield* store.readFighters;
			if (fighters.length === SEATS && fighters.every((fighter) => fighter.critter !== null)) {
				yield* startTurn("lobby", 0);
			}
		});

		/** Plays `card` from the player's hand. The last card of the turn starts the reveal. */
		const playCard = (playerId: string, card: Card) =>
			Effect.gen(function* () {
				const { turn, isAllIn } = yield* Effect.gen(function* () {
					const room = yield* store.readRoom;
					if (room.phase !== "pick") return yield* reject("wrong_phase");
					const maybeHand = yield* store.readHand(room.turn, playerId);
					if (Option.isNone(maybeHand)) return yield* reject("wrong_phase");
					const hand = maybeHand.value;
					if (hand.played !== null) return yield* reject("already_done");
					if (!hand.cards.includes(card)) return yield* reject("not_in_hand");
					yield* store.play(room.turn, playerId, card);
					const hands = yield* store.readHands(room.turn);
					const isAllIn = hands.every((entry) => entry.played !== null || entry.playerId === playerId);
					return { turn: room.turn, isAllIn };
				}).pipe(store.transaction, Effect.catchTag("SqlError", Effect.die));

				if (isAllIn) yield* toReveal(turn);
				yield* publish;
			});

		/**
		 * What the computer trainer sees in `turn`: only its own hand and the public
		 * state. It reads no other hand of this turn, so it cannot know the rival's card.
		 */
		const cpuSight = (turn: number, cpuId: string) =>
			Effect.gen(function* () {
				const room = yield* store.readRoom;
				const fighters = yield* store.readFighters;
				const maybeHand = yield* store.readHand(turn, cpuId);
				const me = fighters.find((fighter) => fighter.id === cpuId);
				const rival = fighters.find((fighter) => fighter.id !== cpuId);
				if (Option.isNone(maybeHand) || me === undefined || rival === undefined) return Option.none();
				const rivalPastPlays = yield* store.readPastPlays(turn, rival.id);
				return Option.some({
					hand: maybeHand.value.cards,
					hp: me.hp,
					rivalHp: rival.hp,
					turn,
					maxTurns: room.maxTurns,
					rivalPastPlays,
				});
			});

		/** The seated player who made the call, or `not_a_player`. */
		const callerPlayer = (connection: Option.Option<{ readonly params: JoinParams }>) =>
			Effect.gen(function* () {
				if (Option.isNone(connection) || connection.value.params.role !== "player") {
					return yield* reject("not_a_player");
				}
				const { playerId } = connection.value.params;
				if (!(yield* store.isSeated(playerId))) return yield* reject("not_a_player");
				return playerId;
			});

		// A crash between a phase change and its timer would stall the room, so
		// every wake arms the timer again when none is pending.
		const room = yield* store.readRoom;
		if (room.phase !== "lobby" && room.deadlineAt !== null) {
			const pending = yield* schedule.list.pipe(Effect.orDie);
			if (pending.length === 0) {
				const now = yield* Clock.currentTimeMillis;
				yield* armTimer(room.turn, room.phase, room.deadlineAt - now);
			}
		}

		return Room.of(
			{
				GetRoom: () => readView,

				GetHand: Effect.fn("Room.GetHand")(function* ({ connection }) {
					const playerId = yield* callerPlayer(connection);
					return yield* handFor(playerId);
				}),

				PickCritter: Effect.fn("Room.PickCritter")(function* ({ payload, connection }) {
					const playerId = yield* callerPlayer(connection);
					const room = yield* store.readRoom;
					if (room.phase !== "lobby") return yield* reject("wrong_phase");
					yield* store.setCritter(playerId, payload.critter);
					yield* startWhenReady;
					yield* publish;
				}),

				Play: Effect.fn("Room.Play")(function* ({ payload, connection }) {
					const playerId = yield* callerPlayer(connection);
					yield* playCard(playerId, payload.card);
				}),

				CpuPlay: Effect.fn("Room.CpuPlay")(function* ({ payload, connection }) {
					if (Option.isSome(connection)) return yield* reject("scheduled_only");
					const room = yield* store.readRoom;
					// A turn that already moved on, for example on the timer, ignores a late pick.
					if (room.cpuId === null || room.phase !== "pick" || room.turn !== payload.turn) return;
					const maybeSight = yield* cpuSight(payload.turn, room.cpuId);
					if (Option.isNone(maybeSight)) return;
					const roll = yield* Random.next;
					yield* playCard(room.cpuId, chooseCpuCard(maybeSight.value, roll)).pipe(
						Effect.catchTag("MoveRejected", () => Effect.void),
					);
				}),

				EndPhase: Effect.fn("Room.EndPhase")(function* ({ payload, connection }) {
					// Only the schedule calls this. A client call has a connection.
					if (Option.isSome(connection)) return yield* reject("scheduled_only");
					const { turn, phase } = payload;
					switch (phase) {
						case "pick":
							yield* toReveal(turn);
							break;
						case "reveal":
							yield* afterReveal(turn);
							break;
						case "lobby":
						case "over":
							break;
					}
					yield* publish;
				}),

				Close: Effect.fn("Room.Close")(function* ({ connection }) {
					if (Option.isSome(connection)) return yield* reject("scheduled_only");
					const room = yield* store.readRoom;
					if (room.phase === "over") yield* Actor.destroy;
				}),
			},
			{
				// A new player takes a seat only in the lobby. A seated player can
				// always come back, for example after a reload.
				authorize: (params) =>
					Effect.gen(function* () {
						if (params.role === "spectator") return;
						// Nobody may connect as the computer trainer.
						if (params.playerId === CPU_ID) return yield* Effect.fail(new RoomRefused({ reason: "full" }));
						const name = params.name.trim();
						if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
							return yield* Effect.fail(new RoomRefused({ reason: "name" }));
						}
						if (yield* store.isSeated(params.playerId)) return;
						const room = yield* store.readRoom;
						if (room.phase !== "lobby") return yield* Effect.fail(new RoomRefused({ reason: "started" }));
						const fighters = yield* store.readFighters;
						if (fighters.length >= SEATS) return yield* Effect.fail(new RoomRefused({ reason: "full" }));
						yield* store.seat(params.playerId, name, MAX_HP);
					}).pipe(store.transaction, Effect.catchTag("SqlError", Effect.die)),

				// Only players may listen for hands. A spectator that tries is disconnected.
				canSubscribe: {
					Hand: (connection) => Effect.succeed(connection.params.role === "player"),
				},

				onConnect: () => publish,

				// A player who leaves the lobby gives up the seat.
				onDisconnect: (closed) =>
					Effect.gen(function* () {
						if (closed.params.role === "player") {
							const room = yield* store.readRoom;
							const open = yield* connections.list;
							const isStillHere = open.some(
								(connection) => connection.id !== closed.id && connection.params.playerId === closed.params.playerId,
							);
							if (room.phase === "lobby" && !isStillHere) yield* store.unseat(closed.params.playerId);
						}
						yield* publish;
					}),

				// The finished fight goes to the leaderboard as the room is destroyed. The Hall is
				// for fights between people, so a solo fight stays out of it.
				onDestroy: Effect.gen(function* () {
					const room = yield* store.readRoom;
					if (room.phase !== "over" || room.cpuId !== null) return;
					const fighters = yield* store.readFighters;
					const finishedAt = yield* Clock.currentTimeMillis;
					yield* leaderboard
						.RecordResult({
							code,
							finishedAt,
							turns: room.turn,
							winner: fighters.find((fighter) => fighter.id === room.winnerId)?.name ?? null,
							fighters: fighters.flatMap((fighter) =>
								fighter.critter === null ? [] : [{ name: fighter.name, critter: fighter.critter, hp: fighter.hp }],
							),
						})
						.pipe(Effect.orDie);
				}),
			},
		);
	}),
	{
		db: db(),
		onMigrate: () => migrateRoom,
		onCreate: createRoom,
		name: "Room",
		icon: "swords",
	},
);
