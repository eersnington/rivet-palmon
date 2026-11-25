import type { HtmlBuilder } from "foldkit/html";
import { type Icon, iconUrl } from "../art/icons.ts";
import { Message } from "../message.ts";
import type { Model } from "../model.ts";

export type H = HtmlBuilder<Message>;

/** A CSS time, such as an animation delay. */
export const ms = (value: number) => `${Math.round(value)}ms`;

export const pixelImg = (src: string, alt: string, className: string, h: H) =>
	h.img([h.Src(src), h.Alt(alt), h.Class(`pixel ${className}`), h.Attribute("draggable", "false")]);

export const icon = (name: Icon, className: string, h: H) => pixelImg(iconUrl(name), "", `icon ${className}`, h);

/** A row of square pips, `on` of them filled. */
export const pips = (count: number, on: number, tone: string, h: H) =>
	h.span(
		[h.Class(`pips ${tone}`), h.AriaHidden(true)],
		Array.from({ length: count }, (_, index) => h.span([h.Class(`pip ${index < on ? "on" : ""}`)], [])),
	);

/** The music switch and the effects switch, side by side. Each switches only its own bus. */
export const soundButtons = (model: Model, h: H) => {
	const soundLabel = model.isSoundOn ? "Sound effects on" : "Sound effects off";
	const musicLabel = model.isMusicOn ? "Music on" : "Music off";
	return h.span(
		[h.Class("sound-buttons")],
		[
			h.button(
				[
					h.Type("button"),
					h.Class("btn small mute"),
					h.AriaLabel(musicLabel),
					h.Title(musicLabel),
					h.AriaPressed(model.isMusicOn ? "true" : "false"),
					h.OnClick(Message.ClickedMusic()),
				],
				[icon(model.isMusicOn ? "music" : "musicOff", "", h)],
			),
			h.button(
				[
					h.Type("button"),
					h.Class("btn small mute"),
					h.AriaLabel(soundLabel),
					h.Title(soundLabel),
					h.AriaPressed(model.isSoundOn ? "true" : "false"),
					h.OnClick(Message.ClickedMute()),
				],
				[icon(model.isSoundOn ? "sound" : "muted", "", h)],
			),
		],
	);
};
