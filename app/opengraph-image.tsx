import { ImageResponse } from "next/og";

/** Link preview for Messenger, Viber, iMessage etc. — invites are how the game spreads. */
export const alt = "Us vs. Us — how well do you really know your people?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        background: "#1a1325",
        color: "#f6f2fb",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 120, fontWeight: 800, letterSpacing: -3 }}>
        <span>Us&nbsp;</span>
        <span
          style={{
            backgroundImage: "linear-gradient(90deg, #ff6f9f, #a65cf0)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          vs.
        </span>
        <span>&nbsp;Us</span>
      </div>
      <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>How well do you really know your people?</div>
      <div style={{ display: "flex", fontSize: 34, color: "#bbb1cc" }}>
        A party game for your phones · No app, no sign-up
      </div>
    </div>,
    size,
  );
}
