//! Every sound is synthesized with Tone.js. All pitched notes come from C major
//! pentatonic, so sounds that overlap still sound like one chord. Tails are
//! short, the master is quiet, and nothing loops.
import { Context, Effect, Layer, Option, Ref, Schema, type Scope } from "effect";
import * as Tone from "tone";
import { createMusic, type Music, type MusicMood } from "./music/player.ts";

export const CueName = Schema.Literals([
	"flip",
	"pick",
	"susSting",
	"deal",
	"lock",
	"join",
	"ak",
	"m4",
	"awp",
	"p90",
	"deagle",
	"impact",
	"guard",
	"snack",
	"drain",
	"heal",
	"tick",
	"tickUrgent",
	"duck",
	"nope",
	"victory",
	"lose",
]);
export type CueName = typeof CueName.Type;

/**
 * One sound, `delayMs` from now. `amount` scales cues such as `drain`, is 2
 * for a heavy attack, and is the length in milliseconds of a `duck`.
 */
export const Cue = Schema.Struct({ name: CueName, amount: Schema.Number, delayMs: Schema.Number });
export type Cue = typeof Cue.Type;

export const cue = (name: CueName, amount = 0, delayMs = 0): Cue => ({ name, amount, delayMs });

export const Gun = Schema.Literals(["ak", "m4", "awp", "p90", "deagle"]);
export type Gun = typeof Gun.Type;

/** How each gun sounds: the center of its noise in Hz, how long the burst rings, its loudness, and a crunch for weight. */
const GUN_SOUNDS: Readonly<Record<Gun, { readonly hz: number; readonly seconds: number; readonly db: number; readonly crunch: boolean }>> = {
	ak: { hz: 1300, seconds: 0.09, db: -6, crunch: true },
	m4: { hz: 2300, seconds: 0.06, db: -8, crunch: false },
	awp: { hz: 700, seconds: 0.28, db: -3, crunch: true },
	p90: { hz: 3400, seconds: 0.035, db: -10, crunch: false },
	deagle: { hz: 1000, seconds: 0.16, db: -4, crunch: true },
};

/** C D E G A, the only notes this game plays. */
const PENTATONIC = ["C", "D", "E", "G", "A"] as const;

/** The pentatonic note `steps` above C in `octave`, wrapping into higher octaves. */
const pent = (steps: number, octave: number) => {
	const index = ((steps % 5) + 5) % 5;
	return `${PENTATONIC[index]}${octave + Math.floor(steps / 5)}`;
};

/** The instruments, and every node they use so the speaker can dispose them. */
export interface Rig {
	readonly nodes: ReadonlyArray<Tone.ToneAudioNode>;
	readonly lead: Tone.PolySynth<Tone.Synth>;
	readonly bass: Tone.Synth;
	readonly slide: Tone.Synth;
	readonly drum: Tone.MembraneSynth;
	readonly bell: Tone.FMSynth;
	readonly click: Tone.NoiseSynth;
	readonly clickFilter: Tone.Filter;
	readonly crunch: Tone.NoiseSynth;
	readonly buzz: Tone.Synth;
	/** Fat, detuned saw voices behind a filter that snaps open: the brass hit of the "sus" sting. */
	readonly brass: Tone.PolySynth<Tone.MonoSynth>;
	/** Only the sting's falling tail plays on it, because the tail schedules a pitch slide ahead. */
	readonly sting: Tone.Synth;
	/** Only the alarm plays on it, for the same reason. */
	readonly alarm: Tone.Synth;
	/** One noise voice per gun, each behind its own fixed filter, so no gun schedules on another's timeline. */
	readonly guns: Readonly<Record<Gun, Tone.NoiseSynth>>;
	/** The battle music, on its own bus into the shared limiter, so music and effects never clip together. */
	readonly music: Music;
	readonly setEffectsOn: (on: boolean) => void;
	readonly isEffectsOn: () => boolean;
}

/** Builds the instruments once the browser lets audio start. */
const buildRig = (): Rig => {
	const nodes: Array<Tone.ToneAudioNode> = [];
	const own = <Node extends Tone.ToneAudioNode>(node: Node): Node => {
		nodes.push(node);
		return node;
	};

	// Quiet master: a soft top end, a small room, and a limiter so stacked hits never clip.
	// Exactly two buses feed the limiter, so effects and music switch off on their own.
	const master = own(new Tone.Volume(-10)).toDestination();
	const limiter = own(new Tone.Limiter(-4)).connect(master);
	const effects = own(new Tone.Gain(1)).connect(limiter);
	const musicBus = own(new Tone.Gain(0)).connect(limiter);
	const room = own(new Tone.Reverb({ decay: 0.7, preDelay: 0.01, wet: 0.14 })).connect(effects);
	const tone = own(new Tone.Filter({ type: "lowpass", frequency: 6500, rolloff: -12 })).connect(room);

	const lead = own(new Tone.PolySynth(Tone.Synth, {
		oscillator: { type: "square" },
		envelope: { attack: 0.002, decay: 0.09, sustain: 0.18, release: 0.08 },
	})).connect(tone);
	lead.volume.value = -16;
	lead.maxPolyphony = 12;

	const bass = own(new Tone.Synth({
		oscillator: { type: "triangle" },
		envelope: { attack: 0.004, decay: 0.15, sustain: 0.3, release: 0.12 },
	})).connect(tone);
	bass.volume.value = -8;

	const slide = own(new Tone.Synth({
		oscillator: { type: "triangle" },
		portamento: 0.12,
		envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.25 },
	})).connect(tone);
	slide.volume.value = -9;

	const drum = own(new Tone.MembraneSynth({
		pitchDecay: 0.045,
		octaves: 5,
		envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.08 },
	})).connect(effects);
	drum.volume.value = -6;

	const bell = own(new Tone.FMSynth({
		harmonicity: 3,
		modulationIndex: 5,
		envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.2 },
		modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
	})).connect(tone);
	bell.volume.value = -14;

	const clickFilter = own(new Tone.Filter({ type: "bandpass", frequency: 3200, Q: 2 })).connect(tone);
	const click = own(new Tone.NoiseSynth({
		noise: { type: "white" },
		envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
	})).connect(clickFilter);
	click.volume.value = -14;

	const crunchDrive = own(new Tone.Distortion(0.55)).connect(own(new Tone.Filter({ type: "lowpass", frequency: 2400 })).connect(effects));
	const crunch = own(new Tone.NoiseSynth({
		noise: { type: "brown" },
		envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.05 },
	})).connect(crunchDrive);
	crunch.volume.value = -6;

	const buzz = own(new Tone.Synth({
		oscillator: { type: "sawtooth" },
		envelope: { attack: 0.004, decay: 0.05, sustain: 0.7, release: 0.04 },
	})).connect(own(new Tone.Filter({ type: "lowpass", frequency: 1100 })).connect(tone));
	buzz.volume.value = -14;

	// The sting gets a bigger room than the rest, so the brass hit rings for a moment.
	const hall = own(new Tone.Reverb({ decay: 1.4, preDelay: 0.02, wet: 0.32 })).connect(effects);
	const brass = own(new Tone.PolySynth(Tone.MonoSynth, {
		oscillator: { type: "fatsawtooth", count: 3, spread: 28 },
		filter: { type: "lowpass", Q: 2, rolloff: -24 },
		envelope: { attack: 0.006, decay: 0.3, sustain: 0.35, release: 0.25 },
		filterEnvelope: { attack: 0.004, decay: 0.28, sustain: 0.2, release: 0.2, baseFrequency: 180, octaves: 3.6 },
	})).connect(hall);
	brass.volume.value = -13;
	brass.maxPolyphony = 6;

	const sting = own(new Tone.Synth({
		oscillator: { type: "fatsawtooth", count: 2, spread: 20 },
		envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.18 },
	})).connect(own(new Tone.Filter({ type: "lowpass", frequency: 700, Q: 1 })).connect(hall));
	sting.volume.value = -15;

	const alarm = own(new Tone.Synth({
		oscillator: { type: "square" },
		envelope: { attack: 0.003, decay: 0.02, sustain: 0.8, release: 0.03 },
	})).connect(own(new Tone.Filter({ type: "lowpass", frequency: 3200 })).connect(tone));
	alarm.volume.value = -19;

	// Each gun is a short burst of noise through its own filter: low and long for big guns, high and short for small ones.
	const gunVoice = (gun: Gun) => {
		const sound = GUN_SOUNDS[gun];
		const filter = own(new Tone.Filter({ type: "bandpass", frequency: sound.hz, Q: 0.9 })).connect(effects);
		const voice = own(new Tone.NoiseSynth({
			noise: { type: "white" },
			envelope: { attack: 0.001, decay: sound.seconds, sustain: 0, release: 0.02 },
		})).connect(filter);
		voice.volume.value = sound.db;
		return voice;
	};
	const guns = { ak: gunVoice("ak"), m4: gunVoice("m4"), awp: gunVoice("awp"), p90: gunVoice("p90"), deagle: gunVoice("deagle") };

	const music = createMusic(musicBus);
	let isEffectsOn = true;

	/** Switches the effects bus. Music is not on it, so it keeps playing. */
	const setEffectsOn = (on: boolean) => {
		isEffectsOn = on;
		const now = Tone.now();
		effects.gain.cancelAndHoldAtTime(now);
		effects.gain.linearRampToValueAtTime(on ? 1 : 0, now + 0.05);
	};

	return {
		nodes,
		lead,
		bass,
		slide,
		drum,
		bell,
		click,
		clickFilter,
		crunch,
		buzz,
		brass,
		sting,
		alarm,
		guns,
		music,
		setEffectsOn,
		isEffectsOn: () => isEffectsOn,
	};
};

/** Waits briefly for the audio context to start, then builds the instruments. */
const openRig = Effect.promise(() => Tone.start()).pipe(
	Effect.timeout("1 second"),
	Effect.ignore,
	Effect.andThen(Effect.sync(buildRig)),
);

const closeRig = (rig: Rig) =>
	Effect.sync(() => {
		rig.music.dispose();
		rig.nodes.forEach((node) => node.dispose());
	});

/**
 * The instruments, open while sound is on and the viewer has pressed something
 * on the page. A browser does not start audio before that. The speaker keeps
 * the last mood and effects switch it was given, so instruments that open
 * later start with them. While it is closed, sounds play nothing.
 */
export class Speaker extends Context.Service<
	Speaker,
	{
		/** Opens the instruments for the life of the scope. */
		readonly open: Effect.Effect<void, never, Scope.Scope>;
		/** Moves the music to `mood` on its next bar line. */
		readonly setMood: (mood: MusicMood) => Effect.Effect<void>;
		/** Switches the effects bus. The music bus is separate and keeps playing. */
		readonly setEffectsOn: (isOn: boolean) => Effect.Effect<void>;
		readonly play: (cues: ReadonlyArray<Cue>) => Effect.Effect<void>;
	}
>()("palmon/Speaker") {
	static readonly layer = Layer.effect(
		Speaker,
		Effect.gen(function* () {
			const maybeRig = yield* Ref.make(Option.none<Rig>());
			const mood = yield* Ref.make<MusicMood>("off");
			const isEffectsOn = yield* Ref.make(true);

			// Tone.js throws on some scheduling races. A sound that fails is skipped, and the app keeps going.
			const withRig = (f: (rig: Rig) => Effect.Effect<void>) =>
				Ref.get(maybeRig).pipe(
					Effect.flatMap(Option.match({ onNone: () => Effect.void, onSome: f })),
					Effect.catchDefect((defect) => Effect.logWarning("speaker skipped a sound", defect)),
				);

			const acquire = Effect.gen(function* () {
				const rig = yield* openRig;
				rig.setEffectsOn(yield* Ref.get(isEffectsOn));
				rig.music.setMood(yield* Ref.get(mood));
				yield* Ref.set(maybeRig, Option.some(rig));
				return rig;
			});
			const release = (rig: Rig) => Ref.set(maybeRig, Option.none()).pipe(Effect.andThen(closeRig(rig)));

			return {
				open: Effect.acquireRelease(acquire, release).pipe(
					Effect.asVoid,
					Effect.catchDefect((defect) => Effect.logWarning("speaker could not open", defect)),
				),
				setMood: (next) =>
					Ref.set(mood, next).pipe(Effect.andThen(withRig((rig) => Effect.sync(() => rig.music.setMood(next))))),
				setEffectsOn: (isOn) =>
					Ref.set(isEffectsOn, isOn).pipe(Effect.andThen(withRig((rig) => Effect.sync(() => rig.setEffectsOn(isOn))))),
				play: (cues) => withRig((rig) => playCues(rig, cues)),
			};
		}),
	);
}

/** Seconds after a beat starts when each shot fires: one, or three for a heavy attack. Matches `shotTimes` in the view. */
const shotTimes = (amount: number) => (amount > 1 ? [0.14, 0.22, 0.3] : [0.22]);

/** Each shot: a noise burst from the gun's voice, a click from the action, and a crunch for the big ones. */
const shootAt = (r: Rig, gun: Gun, t: number, amount: number) => {
	const sound = GUN_SOUNDS[gun];
	shotTimes(amount).forEach((at) => {
		r.guns[gun].triggerAttackRelease(sound.seconds, t + at);
		r.click.triggerAttackRelease(0.015, t + at);
		if (sound.crunch) r.crunch.triggerAttackRelease(sound.seconds, t + at);
	});
};

/**
 * The "sus" sting, about 0.8 s: a low brass chord hits, then one voice sags
 * down an octave into the reverb. It plays only on its own synths: a shared
 * synth or noise would get events earlier than ones the sting already
 * queued, such as the impact that lands before the sting's tail, and Tone
 * refuses those. The tail also drops any later pitch events, such as the
 * end of an overlapping sting.
 */
const susStingAt = (r: Rig, time: number) => {
	r.brass.triggerAttackRelease(["C2", "G2", "C3", "E3"], 0.32, time, 0.9);

	r.sting.frequency.cancelScheduledValues(time);
	r.sting.triggerAttackRelease("G3", 0.42, time + 0.3);
	r.sting.frequency.setValueAtTime(Tone.Frequency("G3").toFrequency(), time + 0.38);
	r.sting.frequency.exponentialRampToValueAtTime(Tone.Frequency("G2").toFrequency(), time + 0.72);
};

/** A short alarm, about 0.35 s: two high notes swapped three times. */
const alarmAt = (r: Rig, time: number) => {
	r.alarm.frequency.cancelScheduledValues(time);
	["A5", "E5", "A5", "E5", "A5", "E5"].forEach((note, index) => {
		r.alarm.triggerAttackRelease(note, 0.05, time + index * 0.06);
	});
};

/** How each cue sounds. `t` is when it starts on the audio clock. */
const VOICES: Readonly<Record<CueName, (r: Rig, t: number, amount: number) => void>> = {
	flip: (r, t) => {
		r.click.triggerAttackRelease(0.03, t);
		r.lead.triggerAttackRelease(pent(2, 6), 0.05, t + 0.02, 0.7);
	},
	pick: (r, t) => {
		r.lead.triggerAttackRelease(pent(0, 5), 0.06, t, 0.7);
		r.lead.triggerAttackRelease(pent(3, 5), 0.1, t + 0.07, 0.8);
	},
	susSting: (r, t) => susStingAt(r, t),
	deal: (r, t) => {
		[0, 1, 2].forEach((index) => {
			r.click.triggerAttackRelease(0.02, t + index * 0.07);
			r.lead.triggerAttackRelease(pent(index * 2, 6), 0.03, t + index * 0.07, 0.35);
		});
	},
	lock: (r, t) => {
		r.click.triggerAttackRelease(0.02, t);
		r.lead.triggerAttackRelease(pent(4, 5), 0.04, t, 0.45);
	},
	join: (r, t) => {
		r.lead.triggerAttackRelease(pent(3, 5), 0.06, t, 0.6);
		r.lead.triggerAttackRelease(pent(5, 5), 0.12, t + 0.08, 0.7);
	},
	// Guns. `amount` is 2 for a heavy attack, which fires three shots. Timings match the shots in the view.
	ak: (r, t, amount) => shootAt(r, "ak", t, amount),
	m4: (r, t, amount) => shootAt(r, "m4", t, amount),
	// One heavy shot, then the bolt goes back and forward.
	awp: (r, t, amount) => {
		shootAt(r, "awp", t, amount);
		r.click.triggerAttackRelease(0.03, t + 0.62);
		r.click.triggerAttackRelease(0.03, t + 0.74);
	},
	p90: (r, t, amount) => shootAt(r, "p90", t, amount),
	// A heavy pistol crack, then the "sus" sting. The heavy attack opens with an alarm.
	deagle: (r, t, amount) => {
		if (amount > 1) alarmAt(r, t);
		shootAt(r, "deagle", t, amount);
		susStingAt(r, t + 0.45);
	},
	impact: (r, t, amount) => {
		if (amount > 1) {
			r.drum.triggerAttackRelease("C2", 0.3, t);
			r.crunch.triggerAttackRelease(0.16, t);
			r.lead.triggerAttackRelease(["C3", "G3"], 0.14, t, 0.8);
		} else {
			r.drum.triggerAttackRelease("G2", 0.12, t);
			r.lead.triggerAttackRelease(pent(3, 4), 0.06, t, 0.7);
		}
	},
	guard: (r, t) => {
		r.bell.triggerAttackRelease("A5", 0.3, t);
		r.lead.triggerAttackRelease(pent(2, 6), 0.08, t + 0.05, 0.4);
	},
	snack: (r, t) => {
		[0, 0.09, 0.18].forEach((offset) => r.crunch.triggerAttackRelease(0.04, t + offset));
		[0, 2, 3].forEach((steps, index) => r.lead.triggerAttackRelease(pent(steps, 5), 0.06, t + 0.3 + index * 0.06, 0.55));
	},
	drain: (r, t, amount) => {
		Array.from({ length: Math.min(6, Math.max(1, amount)) }, (_, index) =>
			r.lead.triggerAttackRelease(pent(8 - index, 4), 0.035, t + index * 0.05, 0.45),
		);
	},
	heal: (r, t, amount) => {
		Array.from({ length: Math.min(4, Math.max(1, amount)) }, (_, index) =>
			r.lead.triggerAttackRelease(pent(5 + index, 4), 0.04, t + index * 0.06, 0.45),
		);
	},
	tick: (r, t) => {
		r.click.triggerAttackRelease(0.015, t);
		r.lead.triggerAttackRelease("G5", 0.02, t, 0.3);
	},
	duck: (r, t, amount) => r.music.duck(t, amount / 1000),
	tickUrgent: (r, t) => {
		r.click.triggerAttackRelease(0.015, t);
		r.lead.triggerAttackRelease("A5", 0.025, t, 0.45);
	},
	nope: (r, t) => {
		r.buzz.triggerAttackRelease("D3", 0.1, t);
		r.buzz.triggerAttackRelease("C3", 0.18, t + 0.14);
	},
	victory: (r, t) => {
		[0, 2, 3, 5].forEach((steps, index) => r.lead.triggerAttackRelease(pent(steps, 5), 0.08, t + index * 0.09, 0.8));
		r.lead.triggerAttackRelease([pent(2, 5), pent(3, 5), pent(5, 5)], 0.32, t + 0.38, 0.6);
		r.bass.triggerAttackRelease("C3", 0.12, t);
		r.bass.triggerAttackRelease("G2", 0.12, t + 0.18);
		r.bass.triggerAttackRelease("C3", 0.3, t + 0.38);
	},
	lose: (r, t) => {
		r.slide.triggerAttack("G4", t);
		r.slide.setNote("E4", t + 0.22);
		r.slide.setNote("D4", t + 0.44);
		r.slide.setNote("C4", t + 0.66);
		r.slide.triggerRelease(t + 0.95);
	},
};

/**
 * Plays each cue at its delay. A context that the browser suspended is
 * resumed first. With effects off only `duck` runs, since it shapes the music.
 */
const playCues = (rig: Rig, cues: ReadonlyArray<Cue>) =>
	Effect.sync(() => {
		if (Tone.getContext().state !== "running") void Tone.start();
		const now = Tone.now() + 0.02;
		const playable = rig.isEffectsOn() ? cues : cues.filter((entry) => entry.name === "duck");
		playable.forEach(({ name, amount, delayMs }) => VOICES[name](rig, now + delayMs / 1000, amount));
	});
