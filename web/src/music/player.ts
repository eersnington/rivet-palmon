//! Plays the score in `score.ts` on Tone's Transport. Each arrangement is a
//! set of Tone Parts built once; a change of mood stops the playing Parts and
//! starts the next ones on the next bar line, so the music never cuts mid-bar.
//! Nothing runs per frame: the Transport schedules every note ahead of time.
import { Schema } from "effect";
import * as Tone from "tone";
import {
	A_SECTION,
	B_SECTION,
	BPM,
	COZY,
	COZY_BPM,
	DANGER,
	DANGER_BPM,
	DRAW,
	FANFARE,
	FILL,
	INTRO,
	LOBBY,
	LOBBY_BPM,
	LOSE,
	type Section,
	TURNAROUND,
} from "./score.ts";

/** What the music plays: chosen from the screen, the phase and the HP. */
export const MusicMood = Schema.Literals(["off", "calm", "battle", "danger", "win", "lose", "draw"]);
export type MusicMood = typeof MusicMood.Type;

export interface Music {
	readonly setMood: (mood: MusicMood) => void;
	/** Lowers the music from `time` for `seconds`, so an attack's sound punches through. */
	readonly duck: (time: number, seconds: number) => void;
	readonly dispose: () => void;
}

// THE SCORE AS EVENTS

type Voice = "lead1" | "lead2" | "bass" | "alarm" | "kick" | "snare" | "hat" | "open" | "rush" | "duty";

interface NoteEvent {
	/** Transport time from the start of its Part, in ticks. */
	readonly time: string;
	readonly voice: Voice;
	/** A note name, or the pulse width for `duty`. */
	readonly note: string;
	readonly value: number;
	readonly lengthTicks: number;
	readonly velocity: number;
}

const STEPS_PER_BAR = 16;
const MELODIC_VOICES = ["lead1", "lead2", "bass", "alarm"] as const;
const DRUM_VOICES: Readonly<Record<string, Voice>> = { k: "kick", s: "snare", h: "hat", o: "open", x: "rush" };

/** Turns sections, played one after another, into the events of one Part. */
const eventsOf = (sections: ReadonlyArray<Section>, ppq: number): ReadonlyArray<NoteEvent> => {
	const stepTicks = ppq / 4;
	const events: Array<NoteEvent> = [];
	const bars = sections.flatMap((section) =>
		section.bars.map((bar) => ({ bar, level: section.level ?? 1, swing: section.swing ?? 0 })),
	);
	/** The tick of a step. In a swung section the off-beat eighths land late. */
	const tickOf = (step: number) => {
		const swing = bars[Math.floor(step / STEPS_PER_BAR)]?.swing ?? 0;
		return step * stepTicks + (step % 4 === 2 ? Math.round(swing * stepTicks) : 0);
	};

	for (const voice of MELODIC_VOICES) {
		let open: { note: string; startStep: number; level: number } | undefined;
		const close = (endStep: number) => {
			if (open === undefined) return;
			const accent = open.startStep % STEPS_PER_BAR === 0 ? 1 : 0.85;
			events.push({
				time: `${tickOf(open.startStep)}i`,
				voice,
				note: open.note,
				value: 0,
				lengthTicks: tickOf(endStep) - tickOf(open.startStep),
				velocity: open.level * accent,
			});
			open = undefined;
		};
		bars.forEach(({ bar, level }, barIndex) => {
			const steps = stepsOf(bar[voice], `${voice} in bar ${barIndex + 1}`);
			steps.forEach((step, stepIndex) => {
				const at = barIndex * STEPS_PER_BAR + stepIndex;
				if (step === "-") return;
				close(at);
				if (step !== ".") open = { note: step, startStep: at, level };
			});
		});
		close(bars.length * STEPS_PER_BAR);
	}

	bars.forEach(({ bar, level }, barIndex) => {
		const barTicks = barIndex * STEPS_PER_BAR * stepTicks;
		if (bar.duty !== undefined) {
			events.push({ time: `${barTicks}i`, voice: "duty", note: "", value: bar.duty, lengthTicks: 0, velocity: 0 });
		}
		stepsOf(bar.drums, `drums in bar ${barIndex + 1}`).forEach((step, stepIndex) => {
			for (const hit of step === "." ? [] : [...step]) {
				const voice = DRUM_VOICES[hit];
				if (voice === undefined) throw new Error(`Unknown drum "${hit}" in bar ${barIndex + 1}`);
				events.push({
					time: `${tickOf(barIndex * STEPS_PER_BAR + stepIndex)}i`,
					voice,
					note: "",
					value: 0,
					lengthTicks: stepTicks,
					velocity: level * (stepIndex % 4 === 0 ? 1 : 0.8),
				});
			}
		});
	});
	return events;
};

/** A bar's 16 steps. A voice the bar leaves out rests. */
const stepsOf = (line: string | undefined, where: string): ReadonlyArray<string> => {
	if (line === undefined) return Array.from({ length: STEPS_PER_BAR }, () => ".");
	const steps = line.trim().split(/\s+/);
	if (steps.length !== STEPS_PER_BAR) throw new Error(`The score has ${steps.length} steps for ${where}, not 16`);
	return steps;
};

const barsOf = (sections: ReadonlyArray<Section>) => sections.reduce((total, section) => total + section.bars.length, 0);

// THE BAND

/** The music is quieter than the effects. */
const BUS_DB = -7;
const DUCK_DB = -11;

const buildBand = (output: Tone.InputNode) => {
	const nodes: Array<Tone.ToneAudioNode> = [];
	const own = <Node extends Tone.ToneAudioNode>(node: Node): Node => {
		nodes.push(node);
		return node;
	};
	const ducker = own(new Tone.Volume(0)).connect(output);
	const bus = own(new Tone.Volume(BUS_DB)).connect(ducker);

	const lead1 = own(new Tone.Synth({
		oscillator: { type: "pulse", width: 0.5 },
		envelope: { attack: 0.004, decay: 0.1, sustain: 0.55, release: 0.07 },
	})).connect(bus);
	lead1.volume.value = -17;

	const lead2 = own(new Tone.Synth({
		oscillator: { type: "pulse", width: 0.25 },
		envelope: { attack: 0.004, decay: 0.08, sustain: 0.45, release: 0.06 },
	})).connect(bus);
	lead2.volume.value = -21;

	const bass = own(new Tone.Synth({
		oscillator: { type: "triangle" },
		envelope: { attack: 0.004, decay: 0.12, sustain: 0.8, release: 0.05 },
	})).connect(bus);
	bass.volume.value = -9;

	const alarm = own(new Tone.Synth({
		oscillator: { type: "square" },
		envelope: { attack: 0.003, decay: 0.04, sustain: 0.6, release: 0.03 },
	})).connect(bus);
	alarm.volume.value = -27;

	const kick = own(new Tone.MembraneSynth({
		pitchDecay: 0.028,
		octaves: 4.5,
		envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.04 },
	})).connect(bus);
	kick.volume.value = -11;

	const snareTone = own(new Tone.Filter({ type: "bandpass", frequency: 1900, Q: 0.7 })).connect(bus);
	const snare = own(new Tone.NoiseSynth({
		noise: { type: "white" },
		envelope: { attack: 0.001, decay: 0.11, sustain: 0, release: 0.03 },
	})).connect(snareTone);
	snare.volume.value = -15;

	const hatTone = own(new Tone.Filter({ type: "highpass", frequency: 7200 })).connect(bus);
	const hat = own(new Tone.NoiseSynth({
		noise: { type: "white" },
		envelope: { attack: 0.001, decay: 0.028, sustain: 0, release: 0.01 },
	})).connect(hatTone);
	hat.volume.value = -24;
	const open = own(new Tone.NoiseSynth({
		noise: { type: "white" },
		envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.04 },
	})).connect(hatTone);
	open.volume.value = -27;
	// A noise source cannot start twice at one instant, so the low-HP hats get their own.
	const rush = own(new Tone.NoiseSynth({
		noise: { type: "white" },
		envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
	})).connect(hatTone);
	rush.volume.value = -27;

	/** Plays one event at `time`. Leads stop a little early, so repeated notes stay crisp. */
	const play = (time: number, event: NoteEvent) => {
		const seconds = Tone.Ticks(event.lengthTicks).toSeconds();
		switch (event.voice) {
			case "lead1":
				return lead1.triggerAttackRelease(event.note, seconds * 0.9, time, event.velocity);
			case "lead2":
				return lead2.triggerAttackRelease(event.note, seconds * 0.85, time, event.velocity);
			case "bass":
				return bass.triggerAttackRelease(event.note, seconds * 0.92, time, event.velocity);
			case "alarm":
				return alarm.triggerAttackRelease(event.note, seconds * 0.7, time, event.velocity);
			case "kick":
				return kick.triggerAttackRelease("A1", 0.12, time, event.velocity);
			case "snare":
				return snare.triggerAttackRelease(0.08, time, event.velocity);
			case "hat":
				return hat.triggerAttackRelease(0.02, time, event.velocity);
			case "open":
				return open.triggerAttackRelease(0.1, time, event.velocity);
			case "rush":
				return rush.triggerAttackRelease(0.015, time, event.velocity);
			case "duty":
				return lead1.oscillator.width?.setValueAtTime(event.value, time);
		}
	};

	return { nodes, bus, ducker, play };
};

type Band = ReturnType<typeof buildBand>;

// ARRANGEMENTS

/** What plays for each mood. `body` follows `intro` and loops if `loops`. */
interface Arrangement {
	readonly intro: ReadonlyArray<Section>;
	readonly body: ReadonlyArray<Section>;
	readonly loops: boolean;
	readonly introBpm: number;
	readonly bpm: number;
}

type ArrangementName = "calm" | "battle" | "win" | "lose" | "draw";

const ARRANGEMENTS: Readonly<Record<ArrangementName, Arrangement>> = {
	calm: { intro: [], body: [LOBBY], loops: true, introBpm: LOBBY_BPM, bpm: LOBBY_BPM },
	battle: { intro: [INTRO], body: [A_SECTION, B_SECTION, TURNAROUND], loops: true, introBpm: BPM, bpm: BPM },
	win: { intro: [FANFARE], body: [COZY], loops: true, introBpm: BPM, bpm: COZY_BPM },
	lose: { intro: [], body: [LOSE], loops: false, introBpm: BPM, bpm: BPM },
	draw: { intro: [], body: [DRAW], loops: false, introBpm: BPM, bpm: BPM },
};

const arrangementOf = (mood: Exclude<MusicMood, "off">): ArrangementName => {
	switch (mood) {
		case "calm":
			return "calm";
		case "battle":
		case "danger":
			return "battle";
		case "win":
			return "win";
		case "lose":
			return "lose";
		case "draw":
			return "draw";
	}
};

interface Parts {
	readonly intro: Tone.Part<NoteEvent> | null;
	readonly body: Tone.Part<NoteEvent>;
	readonly introTicks: number;
	readonly bodyTicks: number;
}

/** Where the arrangement that plays now started, so music switched back on picks up where it is. */
interface Placement {
	readonly name: ArrangementName;
	readonly introAt: number;
	readonly bodyAt: number;
}

// THE PLAYER

/** How fast the music fades when it is switched off, and in when it comes back on a bar line. */
const FADE_OUT_SECONDS = 0.15;
const FADE_IN_SECONDS = 0.05;

/**
 * The music for one open speaker, played into `output`, its own bus. The band
 * and its Parts are built when the music first plays. Switching the music off
 * fades the bus and stops the Parts but keeps the Transport running, so
 * switching it on resumes the same arrangement at the next bar line, at the
 * Transport's position, rather than from the top.
 */
export const createMusic = (output: Tone.Gain): Music => {
	let band: Band | null = null;
	let parts: Partial<Record<ArrangementName, Parts>> = {};
	let danger: Tone.Part<NoteEvent> | null = null;
	let fill: Tone.Part<NoteEvent> | null = null;
	let placement: Placement | null = null;
	let isOn = false;
	let isDanger = false;
	let tempoEventIds: ReadonlyArray<number> = [];
	const transport = Tone.getTransport();
	const barTicks = () => transport.PPQ * 4;

	const partOf = (sections: ReadonlyArray<Section>, loops: boolean, currentBand: Band) => {
		const part = new Tone.Part<NoteEvent>((time, event) => currentBand.play(time, event), [...eventsOf(sections, transport.PPQ)]);
		part.loop = loops;
		part.loopEnd = `${barsOf(sections) * barTicks()}i`;
		return part;
	};

	const partsOf = (name: ArrangementName, currentBand: Band): Parts => {
		const existing = parts[name];
		if (existing !== undefined) return existing;
		const arrangement = ARRANGEMENTS[name];
		const built: Parts = {
			intro: arrangement.intro.length === 0 ? null : partOf(arrangement.intro, false, currentBand),
			body: partOf(arrangement.body, arrangement.loops, currentBand),
			introTicks: barsOf(arrangement.intro) * barTicks(),
			bodyTicks: barsOf(arrangement.body) * barTicks(),
		};
		parts = { ...parts, [name]: built };
		return built;
	};

	/** The first bar line far enough ahead that the Transport has not scheduled past it. */
	const nextBarTicks = () => {
		if (transport.state !== "started") return 0;
		const safeTicks = transport.ticks + Tone.Time(0.2).toTicks();
		return Math.ceil(safeTicks / barTicks()) * barTicks();
	};

	const bpmNow = () => {
		if (placement === null) return BPM;
		const arrangement = ARRANGEMENTS[placement.name];
		if (transport.ticks < placement.bodyAt) return arrangement.introBpm;
		return placement.name === "battle" && isDanger ? DANGER_BPM : arrangement.bpm;
	};

	/** Moves the tempo to `bpm` from `time`: at once on a bar line, or over `seconds` for the low-HP lift. */
	const setTempo = (bpm: number, time: number, seconds: number) => {
		transport.bpm.cancelAndHoldAtTime(time);
		if (seconds === 0) transport.bpm.setValueAtTime(bpm, time);
		else transport.bpm.linearRampToValueAtTime(bpm, time + seconds);
	};

	/** Sets the tempo on each tick where the arrangement's tempo may change. */
	const planTempo = (ticks: ReadonlyArray<number>) => {
		tempoEventIds.forEach((id) => transport.clear(id));
		tempoEventIds = ticks.map((at) => transport.scheduleOnce((time) => setTempo(bpmNow(), time, 0), `${at}i`));
	};

	const fadeBusAt = (gain: number, time: number, seconds: number) => {
		output.gain.cancelAndHoldAtTime(time);
		output.gain.linearRampToValueAtTime(gain, time + seconds);
	};

	const stopAll = (at: number) => {
		for (const built of Object.values(parts)) {
			built?.intro?.stop(`${at}i`);
			built?.body.stop(`${at}i`);
		}
		danger?.stop(`${at}i`);
		fill?.stop(`${at}i`);
	};

	/** Starts `name` from its top at bar `at`. From the lobby, a one-bar drum fill leads into the battle. */
	const startFresh = (name: ArrangementName, at: number, currentBand: Band) => {
		const withFill = placement?.name === "calm" && name === "battle" && isOn;
		stopAll(at);
		const introAt = withFill ? at + barTicks() : at;
		if (withFill) {
			fill = fill ?? partOf([FILL], false, currentBand);
			fill.start(`${at}i`);
		}
		const next = partsOf(name, currentBand);
		next.intro?.start(`${introAt}i`);
		next.body.start(`${introAt + next.introTicks}i`);
		placement = { name, introAt: withFill ? at : introAt, bodyAt: introAt + next.introTicks };
		planTempo([at, introAt + next.introTicks]);
	};

	/** Starts the arrangement again at bar `at`, where it would be had it kept playing. */
	const resume = (current: Placement, at: number, currentBand: Band) => {
		const built = partsOf(current.name, currentBand);
		if (at < current.bodyAt) {
			built.intro?.start(`${at}i`, `${Math.max(0, at - (current.bodyAt - built.introTicks))}i`);
			built.body.start(`${current.bodyAt}i`);
		} else {
			const into = at - current.bodyAt;
			const isLooping = ARRANGEMENTS[current.name].loops;
			if (isLooping) built.body.start(`${at}i`, `${into % built.bodyTicks}i`);
			else if (into < built.bodyTicks) built.body.start(`${at}i`, `${into}i`);
		}
		planTempo([at, ...(at < current.bodyAt ? [current.bodyAt] : [])]);
	};

	const setDanger = (on: boolean, at: number, currentBand: Band) => {
		const changed = on !== isDanger;
		isDanger = on;
		const layer = danger ?? partOf([DANGER], true, currentBand);
		danger = layer;
		if (on) layer.start(`${at}i`);
		else layer.stop(`${at}i`);
		if (changed && placement?.name === "battle" && transport.ticks >= placement.bodyAt) setTempo(bpmNow(), Tone.now(), 0.5);
	};

	/**
	 * Throws the Parts away. A stopped Part cannot restart part-way: Tone backdates
	 * its notes to before the stop, where they still count as started, so resuming
	 * always builds fresh Parts.
	 */
	const disposeParts = () => {
		for (const built of Object.values(parts)) {
			built?.intro?.dispose();
			built?.body.dispose();
		}
		danger?.dispose();
		fill?.dispose();
		parts = {};
		danger = null;
		fill = null;
	};

	const dispose = () => {
		disposeParts();
		tempoEventIds.forEach((id) => transport.clear(id));
		transport.stop();
		transport.position = 0;
		band?.nodes.forEach((node) => node.dispose());
		band = null;
		placement = null;
		isOn = false;
		isDanger = false;
		tempoEventIds = [];
	};

	const setMood = (mood: MusicMood) => {
		if (mood === "off") {
			if (!isOn) return;
			isOn = false;
			fadeBusAt(0, Tone.now(), FADE_OUT_SECONDS);
			// The notes already playing ring out under the fade. The Transport keeps running, so
			// the music can come back where it would be.
			disposeParts();
			return;
		}

		const name = arrangementOf(mood);
		const currentBand = band ?? buildBand(output);
		band = currentBand;
		if (transport.state !== "started") {
			transport.bpm.value = ARRANGEMENTS[name].introBpm;
			transport.position = 0;
			transport.start(Tone.now() + 0.05);
		}

		const at = nextBarTicks();
		const wasOn = isOn;
		if (!wasOn && placement !== null && placement.name === name) resume(placement, at, currentBand);
		else if (!wasOn || placement?.name !== name) startFresh(name, at, currentBand);
		isOn = true;
		if (!wasOn) transport.scheduleOnce((time) => fadeBusAt(1, time, FADE_IN_SECONDS), `${at}i`);
		if (!wasOn || (mood === "danger") !== isDanger) setDanger(mood === "danger", at, currentBand);
	};

	const duck = (time: number, seconds: number) => {
		if (band === null) return;
		const volume = band.ducker.volume;
		volume.cancelAndHoldAtTime(time);
		volume.linearRampToValueAtTime(DUCK_DB, time + 0.04);
		volume.setValueAtTime(DUCK_DB, time + seconds);
		volume.linearRampToValueAtTime(0, time + seconds + 0.3);
	};

	return { setMood, duck, dispose };
};
