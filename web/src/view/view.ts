import { Option } from "effect";
import { PalmonDef } from "../definition.ts";
import { type Notice, Screen } from "../model.ts";
import * as Arena from "./arena.ts";
import * as Home from "./home.ts";
import type { H } from "./shared.ts";

const noticeView = (maybeNotice: Option.Option<Notice>, h: H) =>
	h.div.class("notice-slot").children(
		Option.match(maybeNotice, {
			onNone: () => null,
			onSome: (notice) =>
				h.div
					.key(`notice-${notice.id}`)
					.attrs({ role: "status", "aria-live": "polite" })
					.class("notice px pop-in")
					.children(notice.text),
		}),
	);

export const view = PalmonDef.view((h, model) =>
	h.div.class("app").children(
		Screen.match(model.screen, {
			Home: () => Home.view(model, h),
			Arena: ({ arena }) => Arena.view(model, arena, h),
		}),
		noticeView(model.maybeNotice, h),
	),
);
