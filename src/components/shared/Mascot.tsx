import React from "react";
import EscrevozMark from "../icons/EscrevozMark";

interface MascotProps {
  /** Height in px. */
  size: number;
  /** Wave once on arrival, or high-five (re-key it to play again). */
  animation?: "wave" | "slap" | null;
}

// The original 357×400 box, kept so callers' layouts and the wave's pivot hold.
const BOX_ASPECT = 357 / 400;

/** The Escrevoz mark as the onboarding mascot; its cursor blinks while it waits. */
export const Mascot: React.FC<MascotProps> = ({ size, animation = null }) => (
  <span
    style={{ width: size * BOX_ASPECT, height: size }}
    className={`relative block origin-[50%_90%] rotate-[-8deg] select-none text-text ${animation === "wave" ? "animate-wave" : animation === "slap" ? "animate-slap" : ""}`}
  >
    <EscrevozMark width="100%" height="100%" cursorClassName="animate-caret" />
  </span>
);
