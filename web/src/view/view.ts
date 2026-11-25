import { Option } from "effect";
import type { Document } from "foldkit/html";
import { type Model, type Notice, Screen } from "../model.ts";
import * as Arena from "./arena.ts";
import * as Home from "./home.ts";
import type { H } from "./shared.ts";

const noticeView = (maybeNotice: Option.Option<Notice>, h: H) =>
	h.div(
		[h.Class("notice-slot")],
		Option.match(maybeNotice, {
			onNone: () => [],
			onSome: (notice) => [
				h.keyed("div")(`notice-${notice.id}`, [h.Role("status"), h.AriaLive("polite"), h.Class("notice px pop-in")], [notice.text]),
			],
		}),
	);

export const view = (model: Model, h: H): Document => ({
	title: "Palmon",
	body: h.div(
		[h.Class("app")],
		[
			Screen.match(model.screen, {
				Home: () => Home.view(model, h),
				Arena: ({ arena }) => Arena.view(model, arena, h),
			}),
			noticeView(model.maybeNotice, h),
		],
	),
});
