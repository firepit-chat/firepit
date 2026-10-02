export {
    SPOILER_CLOSE,
    SPOILER_OPEN,
    hasSpoilerSyntax,
    splitBySpoilers,
    stripSpoilerSyntax,
    tokenizeSpoilerDelimiters,
} from "../shared/syntax.js";

export type { SpoilerSegment, SpoilerToken } from "../shared/syntax.js";

export { Spoiler } from "./spoiler.js";
export type { SpoilerProps, SpoilerTheme } from "./spoiler.js";
