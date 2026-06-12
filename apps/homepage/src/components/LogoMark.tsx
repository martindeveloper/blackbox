export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`logo-mark ${className}`.trim()}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
    >
      <rect width="512" height="512" rx="120" fill="#0B0F14" />
      <path
        d="M104 134Q104 104 134 104H360Q372 104 372 116V144Q372 156 360 156H172Q156 156 156 172V360Q156 372 144 372H116Q104 372 104 360Z"
        fill="#F1E9DE"
      />
      <path
        d="M408 378Q408 408 378 408H152Q140 408 140 396V368Q140 356 152 356H340Q356 356 356 340V152Q356 140 368 140H396Q408 140 408 152Z"
        fill="#F1E9DE"
      />
      <circle className="logo-mark-glow" cx="256" cy="256" r="33" fill="#E08A45" />
      <circle className="logo-mark-dot" cx="256" cy="256" r="33" fill="#E08A45" />
    </svg>
  );
}
