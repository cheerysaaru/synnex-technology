/* App mark: white bolt on the blue accent square. */
export function BoltMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#2F6BFF" />
      <path d="M17.5 6 10 18h5l-1.5 8L22 14h-5z" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ name = "Synnex", logo, light = true, small }: { name?: string; logo?: string; light?: boolean; small?: string }) {
  const short = name.split(/\s+/)[0].toLowerCase();
  return (
    <span className="flex items-center gap-2.5">
      {logo ? <img src={logo} alt="" className="h-8 w-8 rounded-lg bg-white object-contain p-0.5" /> : <BoltMark />}
      <span className="leading-none">
        <span className={`block text-[19px] font-extrabold tracking-tight ${light ? "text-white" : "text-ink"}`}>{short}</span>
        {small ? <span className={`mt-1 block text-[10.5px] font-medium ${light ? "text-white/45" : "text-mute"}`}>{small}</span> : null}
      </span>
    </span>
  );
}
