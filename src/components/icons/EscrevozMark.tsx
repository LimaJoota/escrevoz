/** The Escrevoz symbol: an opening quote and the text cursor that follows it. */
const EscrevozMark = ({
  width,
  height,
  className,
  cursorClassName,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
  /** Lets the onboarding mascot make the cursor blink. */
  cursorClassName?: string;
}) => (
  <svg
    width={width}
    height={height}
    viewBox="38 54 180 148"
    className={className}
    aria-hidden="true"
  >
    <g fill="currentColor">
      <circle cx="66" cy="127" r="28" />
      <path d="M38 127A84 84 0 0 1 80 54.3L92 75A60 60 0 0 0 64 111.5Z" />
      <circle cx="138" cy="127" r="28" />
      <path d="M110 127A84 84 0 0 1 152 54.3L164 75A60 60 0 0 0 136 111.5Z" />
    </g>
    <rect
      x="192"
      y="54"
      width="26"
      height="148"
      rx="6"
      fill="#ff5a1f"
      className={cursorClassName}
    />
  </svg>
);

export default EscrevozMark;
