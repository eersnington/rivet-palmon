import { Toggle } from "@effect/ui-kit";
import type { Html } from "@effect/ui/html";
import { type Icon, iconUrl } from "../art/icons.ts";
import { Message } from "../message.ts";
import type { Model } from "../model.ts";

export type H = Html.H<Message>;

/** A CSS time, such as an animation delay. */
export const ms = (value: number) => `${Math.round(value)}ms`;

export const pixelImg = (src: string, alt: string, className: string, h: H) =>
	h.img.attrs({ src, alt, draggable: "false" }).class(`pixel ${className}`);

export const icon = (name: Icon, className: string, h: H) => pixelImg(iconUrl(name), "", `icon ${className}`, h);

/** A row of square pips, `on` of them filled. */
export const pips = (count: number, on: number, tone: string, h: H) =>
	h.span
		.class(`pips ${tone}`)
		.attr("aria-hidden", "true")
		.children(Array.from({ length: count }, (_, index) => h.span.class(`pip ${index < on ? "on" : ""}`)));

/** The music switch and the effects switch, side by side. Each switches only its own bus. */
export const soundButtons = (model: Model, h: H) =>
	h.span.class("sound-buttons").children(
		Toggle(h, {
			props: { pressed: model.isMusicOn },
			onToggle: ({ pressed }) => Message.ToggledMusic({ pressed }),
		})
			.class("btn small mute")
			.attrs({ "aria-label": "Music", title: model.isMusicOn ? "Music on" : "Music off" })
			.children(icon(model.isMusicOn ? "music" : "musicOff", "", h)),
		Toggle(h, {
			props: { pressed: model.isSoundOn },
			onToggle: ({ pressed }) => Message.ToggledSound({ pressed }),
		})
			.class("btn small mute")
			.attrs({ "aria-label": "Sound effects", title: model.isSoundOn ? "Sound effects on" : "Sound effects off" })
			.children(icon(model.isSoundOn ? "sound" : "muted", "", h)),
	);
