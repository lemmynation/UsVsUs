import { Fragment } from "react";

// An emoji, including skin-tone/variation selectors and ZWJ sequences like 👩‍❤️‍👨.
const EMOJI = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)/u;

/**
 * Text in the mode gradient. The gradient is painted through transparent text,
 * which would also turn emoji into flat silhouettes — so emoji are kept out of it
 * and show in their own colors.
 */
export function GradientText({ children }: { children: string }) {
  return (
    <>
      {children.split(EMOJI).map((part, i) =>
        part === "" ? null : EMOJI.test(part) ? (
          <Fragment key={i}>{part}</Fragment>
        ) : (
          <span key={i} className="text-mode-gradient">
            {part}
          </span>
        ),
      )}
    </>
  );
}
