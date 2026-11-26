import { BrowserHost } from "@effect/ui/html";
import { Effect, Layer } from "effect";
import { Palmon, props } from "./main.ts";

const Main = BrowserHost.mount(Palmon, props, document.getElementById("root")!);

Layer.launch(Main).pipe(Effect.runFork);
