export {
    SPOILER_CLOSE,
    SPOILER_OPEN,
    hasSpoilerSyntax,
    splitBySpoilers,
    stripSpoilerSyntax,
    tokenizeSpoilerDelimiters,
} from "../shared/syntax.js";

export type { SpoilerSegment, SpoilerToken } from "../shared/syntax.js";

export {
    SPOILER_TAG_NAME,
    containsSpoilerSyntax,
    isSpoilerNode,
    remarkSpoiler,
} from "./remark-spoiler.js";

export type { SpoilerNode, TreeNode } from "./remark-spoiler.js";

export { Spoiler } from "./spoiler.js";
export type { SpoilerClassNames, SpoilerProps } from "./spoiler.js";
