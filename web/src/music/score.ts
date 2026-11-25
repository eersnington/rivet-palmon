//! The battle theme, written as data. Every bar is 16 steps of a sixteenth
//! note each, at 160 BPM in A minor, the key of the sound effects (their C
//! major pentatonic notes all sit in A minor).
//!
//! In a melodic part a step is a note such as `E5`, `-` to hold the note
//! before it, or `.` for a rest. In a drum part a step is any mix of `k`
//! (kick), `s` (snare), `h` (closed hat), `o` (open hat) and `x` (the low-HP
//! hat, a voice of its own so it can land on the beat's hats), or `.` for a rest.

/** One bar of every voice. A missing voice rests. */
export interface Bar {
	/** Pulse lead 1, the hook. */
	readonly lead1?: string;
	/** Pulse lead 2, the answer, stabs and arpeggios. */
	readonly lead2?: string;
	/** Triangle bass. */
	readonly bass?: string;
	readonly drums?: string;
	/** The low-HP alarm tone. */
	readonly alarm?: string;
	/** Lead 1's pulse width for this bar: 0.5 is square, 0.25 and 0.125 get thinner and brighter. */
	readonly duty?: number;
}

export interface Section {
	readonly bars: ReadonlyArray<Bar>;
	/** Scales every note's velocity, so a calm arrangement plays softer. */
	readonly level?: number;
	/** How late the off-beat eighths land, as a share of a sixteenth: 0 is straight, about 0.33 is a lazy shuffle. */
	readonly swing?: number;
}

export const BPM = 160;
/** The lobby tune has its own, relaxed groove. */
export const LOBBY_BPM = 104;
/** The victory loop settles into a slower, cozier tempo. */
export const COZY_BPM = 132;
/** The low-HP layer lifts the tempo a little. */
export const DANGER_BPM = 168;

// BATTLE

/** Two bars that kick the battle off: three hits on A, then a run up to the hook. */
export const INTRO: Section = {
	bars: [
		{
			duty: 0.5,
			lead1: "A4 . . A4 . . A4 . C5 - - - D5 - - -",
			lead2: "E4 . . E4 . . E4 . G4 - - - A4 - - -",
			bass: "A1 . . A1 . . A1 . C2 - - - D2 - - -",
			drums: "k . . k . . k . s . . . s . s s",
		},
		{
			lead1: "E5 - - - - - - - E4 F4 G4 G#4 A4 B4 C5 D5",
			lead2: "B4 - - - - - - - G#4 - - - B4 - - -",
			bass: "E1 - - - - - - - E2 . E2 . E2 E2 E2 E2",
			drums: "kh . . . . . . . s . s . s s s s",
		},
	],
};

/**
 * The hook. Lead 1 calls for two bars while lead 2 stabs off the beat, lead 2
 * answers for two bars, lead 1 climbs through a bright D major, and both
 * leads land on E together. Chords: Am Am F G Am D F E.
 */
export const A_SECTION: Section = {
	bars: [
		{
			duty: 0.5,
			lead1: "A4 - C5 - E5 - A5 - - - G5 - E5 - D5 -",
			lead2: ". . C5 . . . C5 . . . E5 . . . C5 .",
			bass: "A2 . A3 . A2 . A3 . A2 . A3 . A2 . G2 .",
			drums: "kh . h . sh . h k kh . h . sh . h h",
		},
		{
			lead1: "E5 - - - . . C5 D5 E5 - D5 - C5 - B4 -",
			lead2: ". . C5 . . . C5 . . . E5 . . . E5 .",
			bass: "A2 . A3 . A2 . A3 . A2 . A3 . C3 . B2 .",
			drums: "kh . h . sh . h k kh . h . sh . kh h",
		},
		{
			lead2: "A4 - - - C5 - A4 - F4 - - - A4 - C5 -",
			bass: "F2 . F3 . F2 . F3 . F2 . F3 . F2 . E2 .",
			drums: "kh . h . sh . h k kh . h . sh . h h",
		},
		{
			lead1: ". . . . . . . . . . . . G4 - G#4 -",
			lead2: "D5 - - - B4 - G4 - B4 - D5 - G4 - - -",
			bass: "G2 . G3 . G2 . G3 . G2 . G3 . G2 . G#2 .",
			drums: "kh . h . sh . h k kh . h . s . s s",
		},
		{
			duty: 0.25,
			lead1: "A4 - C5 - E5 - A5 - - - B5 - C6 - - -",
			lead2: ". . E5 . . . E5 . . . A5 . . . E5 .",
			bass: "A2 . A3 . A2 . A3 . A2 . A3 . A2 . G2 .",
			drums: "kh . h . sh . h k kh . h . sh . h h",
		},
		{
			lead1: "A5 - - - F#5 - D5 - F#5 - A5 - - - . .",
			lead2: ". . F#5 . . . F#5 . . . A5 . . . F#5 .",
			bass: "D2 . D3 . D2 . D3 . D2 . D3 . D2 . F#2 .",
			drums: "kh . h . sh . h k kh . h . sh . kh h",
		},
		{
			lead1: "C6 - - - A5 - - - F5 - A5 - C6 - D6 -",
			lead2: "A5 - - - F5 - - - C5 - F5 - A5 - B5 -",
			bass: "F2 . F3 . F2 . F3 . F2 . F3 . F2 . F3 .",
			drums: "kh . h . sh . h k kh . h . sh . h h",
		},
		{
			lead1: "B5 - - - - - - - G#5 - - - E5 - - -",
			lead2: "G#5 - - - - - - - E5 - - - B4 - - -",
			bass: "E2 . E3 . E2 . E3 . E2 . E3 . G#2 . B2 .",
			drums: "kh . h . sh . s . s . s s s s s s",
		},
	],
};

/**
 * The lift: the key rises to C major, the relative major, so the effects'
 * notes still fit. Lead 1 soars in long notes on a thin pulse, lead 2 stabs,
 * then spins arpeggios. Chords: F G C Am F G C C.
 */
export const B_SECTION: Section = {
	bars: [
		{
			duty: 0.25,
			lead1: "C6 - - - - - A5 - C6 - D6 - - - C6 -",
			lead2: ". . A4 . . . C5 . . . A4 . . . C5 .",
			bass: "F2 . F3 . F2 . F3 . F2 . F3 . F2 . F3 .",
			drums: "kh . h . sh . o . kh . h k sh . o .",
		},
		{
			lead1: "B5 - - - G5 - - - D6 - - - B5 - G5 -",
			lead2: ". . B4 . . . D5 . . . B4 . . . D5 .",
			bass: "G2 . G3 . G2 . G3 . G2 . G3 . G2 . G3 .",
			drums: "kh . h . sh . o . kh . h k sh . o .",
		},
		{
			lead1: "C6 - - - E6 - - - G6 - - - - - E6 -",
			lead2: ". . G4 . . . C5 . . . E5 . . . C5 .",
			bass: "C3 . C2 . E2 . E3 . G2 . G3 . E2 . C2 .",
			drums: "kh . h . sh . o . kh . h k sh . o .",
		},
		{
			lead1: "D6 - C6 - B5 - C6 - A5 - - - - - - -",
			lead2: ". . A4 . . . C5 . . . E5 . . . E5 .",
			bass: "A2 . A3 . A2 . A3 . A2 . A3 . G2 . E2 .",
			drums: "kh . h . sh . o . kh . h k sh . s s",
		},
		{
			duty: 0.125,
			lead1: "A5 - - - C6 - - - F6 - - - E6 - D6 -",
			lead2: "F4 A4 C5 F5 A5 F5 C5 A4 F4 A4 C5 F5 A5 F5 C5 A4",
			bass: "F2 . F3 . F2 . F3 . F2 . F3 . F2 . F3 .",
			drums: "kh . h . sh . o . kh . h k sh . o .",
		},
		{
			lead1: "D6 - - - B5 - D6 - G6 - - - F6 - D6 -",
			lead2: "G4 B4 D5 G5 B5 G5 D5 B4 G4 B4 D5 G5 B5 G5 D5 B4",
			bass: "G2 . G3 . G2 . G3 . G2 . G3 . G2 . G3 .",
			drums: "kh . h . sh . o . kh . h k sh . o .",
		},
		{
			lead1: "E6 - - - - - - - G6 - - - E6 - C6 -",
			lead2: "C5 E5 G5 C6 E6 C6 G5 E5 C5 E5 G5 C6 E6 C6 G5 E5",
			bass: "C3 . C2 . E2 . E3 . G2 . G3 . E2 . C2 .",
			drums: "kh . h . sh . o . kh . h k sh . o .",
		},
		{
			lead1: "C6 - - - - - - - - - - - . . . .",
			lead2: "G5 E5 C5 G4 E5 C5 G4 E4 C5 G4 E4 C4 . . . .",
			bass: "C3 . C2 . C3 . C2 . B2 . A2 . G2 . B2 .",
			drums: "kh . h . sh . o . kh . s . s s s s",
		},
	],
};

/** Two bars back to the top: D minor, then E major pulls home to A minor. */
export const TURNAROUND: Section = {
	bars: [
		{
			duty: 0.125,
			lead1: "F5 - E5 - D5 - E5 - F5 - A5 - D6 - - -",
			lead2: "D5 F5 A5 D6 A5 F5 D5 F5 D5 F5 A5 D6 A5 F5 D5 F5",
			bass: "D2 . D3 . D2 . D3 . D2 . D3 . F2 . A2 .",
			drums: "kh . h . sh . h k kh . h . sh . h h",
		},
		{
			lead1: "E6 - - - B5 - G#5 - E5 - - - . . . .",
			lead2: "E5 G#5 B5 E6 B5 G#5 E5 G#5 E5 G#5 B5 E6 . . . .",
			bass: "E2 . E3 . E2 . E3 . E2 . E2 E2 E2 E2 . .",
			drums: "kh . h . s . s . s s s s s s s s",
		},
	],
};

/** Added on top of the battle while your HP is low: running hats and a pulsing two-beep alarm. */
export const DANGER: Section = {
	bars: [
		{
			drums: "x x x x x x x x x x x x x x x x",
			alarm: "A5 . A5 . . . . . A5 . A5 . . . . .",
		},
	],
	level: 0.8,
};

// LOBBY AND PICKING

/**
 * The waiting tune: a piece of its own, in C major, the relative major of the
 * battle key, so the battle lands as a lift into A minor. A lazy swung
 * arpeggio on the soft lead, a warm walking triangle bass, and a hook on lead 1
 * that climbs, then answers itself one step lower.
 * Chords: Cmaj7 Em7 Fmaj7 G, Cmaj7 A7 Dm7 G7.
 */
export const LOBBY: Section = {
	swing: 0.34,
	level: 0.8,
	bars: [
		{
			duty: 0.25,
			lead1: ". . G4 - C5 - E5 - - - D5 - E5 - G5 -",
			lead2: "C4 . E4 . G4 . B4 . G4 . E4 . G4 . B4 .",
			bass: "C2 - - - . . G2 . C3 - - - B2 - G2 -",
			drums: "k . . . h . . . k . k . h . . .",
		},
		{
			lead1: "- - - - - - E5 - D5 - B4 - - - . .",
			lead2: "E4 . G4 . B4 . D5 . B4 . G4 . B4 . D5 .",
			bass: "E2 - - - . . B2 . E3 - - - D3 - B2 -",
			drums: "k . . . h . . . k . k . h . . h",
		},
		{
			lead1: ". . A4 - C5 - F5 - - - E5 - F5 - A5 -",
			lead2: "F4 . A4 . C5 . E5 . C5 . A4 . C5 . E5 .",
			bass: "F2 - - - . . C3 . F3 - - - E3 - C3 -",
			drums: "k . . . h . . . k . k . h . . .",
		},
		{
			lead1: "G5 - - - - - - - . . A5 - G5 - E5 -",
			lead2: "G4 . B4 . D5 . G5 . D5 . B4 . D5 . F5 .",
			bass: "G2 - - - . . D3 . G2 - A2 - B2 - D3 -",
			drums: "k . . . h . . . k . k . h . s .",
		},
		{
			lead1: ". . G4 - C5 - E5 - - - D5 - E5 - G5 -",
			lead2: "C4 . E4 . G4 . B4 . G4 . E4 . G4 . B4 .",
			bass: "C2 - - - . . G2 . C3 - - - B2 - G2 -",
			drums: "k . . . h . . . k . k . h . . .",
		},
		{
			lead1: "A5 - - - G5 - - - E5 - C#5 - - - . .",
			lead2: "A4 . C#5 . E5 . G5 . E5 . C#5 . E5 . G5 .",
			bass: "A2 - - - . . E2 . A2 - - - G2 - E2 -",
			drums: "k . . . h . . . k . k . h . . h",
		},
		{
			lead1: ". . F5 - E5 - D5 - - - C5 - D5 - F5 -",
			lead2: "D4 . F4 . A4 . C5 . A4 . F4 . A4 . C5 .",
			bass: "D2 - - - . . A2 . D3 - - - C3 - A2 -",
			drums: "k . . . h . . . k . k . h . . .",
		},
		{
			lead1: "E5 - - - D5 - - - . . . . . . . .",
			lead2: "G4 . B4 . D5 . F5 . D5 . B4 . G4 . B4 .",
			bass: "G2 - - - . . D3 . G2 - - - F2 - D2 -",
			drums: "k . . . h . . . k . . . s . s s",
		},
	],
};

/** One bar of drums from the lobby into the battle's opening hits, at the battle's tempo. */
export const FILL: Section = {
	bars: [
		{
			drums: "k . s . k . s . s s s s s s s s",
			bass: "A1 . . . . . . . E1 . . . . . . .",
		},
	],
};

// ENDINGS

/** Two bars of fanfare: a quick climb in C major, held high, a drum roll under it. */
export const FANFARE: Section = {
	bars: [
		{
			duty: 0.5,
			lead1: "C5 . C5 . E5 . G5 - - . E5 . G5 - - -",
			lead2: "G4 . G4 . C5 . E5 - - . C5 . E5 - - -",
			bass: "C3 . C3 . C3 . C3 - - . G2 . C3 - - -",
			drums: "kh . k . k . sh . . . k . sh . . .",
		},
		{
			lead1: "C6 - - - - - - - D6 - - - E6 - - -",
			lead2: "G5 - - - - - - - G5 - - - G5 - - -",
			bass: "C2 - - - - - - - G2 - - - C3 - - -",
			drums: "kh . . . . . . . s . s s s s s s",
		},
	],
};

/** After the fanfare: a slow, cozy loop. Chords: C Am F G. */
export const COZY: Section = {
	bars: [
		{
			lead2: "E5 - - - D5 - C5 - D5 - - - G4 - - -",
			bass: "C3 - - - - - - - G2 - - - - - - -",
			drums: "k . . . h . . . k . . . h . . .",
		},
		{
			lead2: "C5 - - - D5 - E5 - G5 - - - E5 - - -",
			bass: "A2 - - - - - - - E2 - - - - - - -",
			drums: "k . . . h . . . k . . . h . . .",
		},
		{
			lead2: "F5 - - - E5 - D5 - C5 - - - A4 - - -",
			bass: "F2 - - - - - - - C3 - - - - - - -",
			drums: "k . . . h . . . k . . . h . . .",
		},
		{
			duty: 0.25,
			lead1: ". . . . . . . . G5 B5 D6 G6 . . . .",
			lead2: "B4 - - - C5 - D5 - G4 - - - - - - -",
			bass: "G2 - - - - - - - D3 - - - B2 - - -",
			drums: "k . . . h . . . k . . . h . . .",
		},
	],
	level: 0.75,
};

/** A fall from E down to A, lower and slower each step. */
export const LOSE: Section = {
	bars: [
		{
			duty: 0.5,
			lead1: "E5 - - - D5 - - - C5 - - - B4 - - -",
			lead2: "C5 - - - B4 - - - A4 - - - G#4 - - -",
			bass: "A2 - - - G2 - - - F2 - - - E2 - - -",
			drums: "k . . . . . . . k . . . . . . .",
		},
		{
			lead1: "A4 - - - - - - - - - - - . . . .",
			lead2: "E4 - - - - - - - - - - - . . . .",
			bass: "A1 - - - - - - - - - . . . . . .",
			drums: "k . . . . . . . . . . . . . . .",
		},
	],
};

/** A shrug: the phrase climbs, then stops on a D that never resolves. */
export const DRAW: Section = {
	bars: [
		{
			duty: 0.25,
			lead1: "E5 . D5 . E5 . A5 - - - G5 - - - - -",
			lead2: "C5 . B4 . C5 . E5 - - - D5 - - - - -",
			bass: "A2 . . . A2 . . . D2 - - - - - - -",
			drums: "k . . . s . . . k . . . s . . .",
		},
		{
			lead1: "D5 - - - - - - - - - - - . . . .",
			lead2: "B4 - - - - - - - - - - - . . . .",
			bass: "E2 - - - - - - - - - - - . . . .",
			drums: "k . . . . . . . . . . . . . . .",
		},
	],
};
