/** The Escrevoz lockup: the symbol, then the hand-built monoline wordmark. */
const EscrevozLogo = ({
  width,
  height,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) => (
  <svg
    width={width}
    height={height}
    viewBox="30 50 900 156"
    className={`text-text ${className ?? ""}`}
    role="img"
    aria-label="Escrevoz"
  >
    <g fill="currentColor">
      <circle cx="66" cy="127" r="28" />
      <path d="M38 127A84 84 0 0 1 80 54.3L92 75A60 60 0 0 0 64 111.5Z" />
      <circle cx="138" cy="127" r="28" />
      <path d="M110 127A84 84 0 0 1 152 54.3L164 75A60 60 0 0 0 136 111.5Z" />
    </g>
    <rect x="192" y="54" width="26" height="148" rx="6" fill="#ff5a1f" />
    <g
      transform="translate(262 83) scale(0.75)"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="28"
    >
      <path fill="none" d="M106 60A46 46 0 1 0 95.2 89.6" />
      <path fill="none" d="M14 60H106" />
      <path
        fill="none"
        d="M197.8 20.7A28 23 0 1 0 178 60A28 23 0 1 1 158.2 99.3"
      />
      <path fill="none" d="M331.2 30.4A46 46 0 1 0 331.2 89.6" />
      <path fill="none" d="M367 120V0" />
      <path fill="none" d="M367 60A46 46 0 0 1 413 14" />
      <path fill="none" d="M529 60A46 46 0 1 0 518.3 89.6" />
      <path fill="none" d="M437 60H529" />
      <path stroke="none" d="M555 0H585L601 78L617 0H647L617 120H585Z" />
      <circle fill="none" cx="717" cy="60" r="46" />
      <path stroke="none" d="M791 0H877V26L827 94H879V120H791V94L841 26H791Z" />
    </g>
  </svg>
);

export default EscrevozLogo;
