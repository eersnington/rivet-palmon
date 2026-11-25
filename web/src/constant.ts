/** The localStorage key of this browser's player id and name. */
export const PROFILE_STORAGE_KEY = "palmon-profile";

/** The localStorage key of the mute switch. */
export const MUTED_STORAGE_KEY = "palmon-muted";

/** The localStorage key of the music switch. Effects keep playing while music is off. */
export const MUSIC_OFF_STORAGE_KEY = "palmon-music-off";

/** The sessionStorage key of the room and role of this tab, so a reload goes straight back in. */
export const SEAT_STORAGE_KEY = "palmon-seat";

/** The wait before a lost connection opens again. */
export const RECONNECT_DELAY = "2 seconds";

/** How long a notice stays up. */
export const NOTICE_MS = 2600;

/** How long after the room's close time to wait before going home. */
export const CLOSE_GRACE_MS = 1500;

/** How often the countdown and the result bar move. */
export const TICK_INTERVAL = "250 millis";

/** Room codes use consonants only, so no code spells a word. */
export const CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
export const CODE_LENGTH = 4;

/** A taken room code fails to create, so a new room tries this many more codes. */
export const CREATE_ROOM_RETRIES = 3;

/** How many finished battles the home screen keeps. */
export const RECENT_LIMIT = 8;
