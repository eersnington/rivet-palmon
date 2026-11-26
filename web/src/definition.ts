//! The root component's definition: its name and Schemas. `update` and the
//! views are typed against it, and `main.ts` finishes it with `make`.
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { Message } from "./message.ts";
import { Flags, Model } from "./model.ts";

export const PalmonProps = Schema.Struct({
	/** What the browser saved, read once in `init`. */
	initial: Flags,
});
export type PalmonProps = typeof PalmonProps.Type;

export const PalmonDef = Html.component({
	name: "Palmon",
	props: PalmonProps,
	model: Model,
	message: Message,
});
