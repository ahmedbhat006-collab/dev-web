/**
 * Hand-drawn animated scene for the sign-in page: a person working at a laptop while
 * Dastak's work floats around them: a WhatsApp message, an assigned lead with a live
 * countdown, the AI assistant typing, a payment and a calendar booking.
 * Pure SVG + CSS (see .scene-* classes in globals.css); colors follow the theme tokens.
 */
export function LoginScene() {
  const skin = "#e5ae88";
  const skinShade = "#d39a74";
  const hair = "#2b2420";
  return (
    <svg viewBox="0 0 560 470" role="img" aria-label="A person at a laptop while leads, messages, payments and bookings flow in" className="h-auto w-full max-w-[640px]">
      <defs>
        <radialGradient id="screenGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Connectors from each card into the laptop */}
      <g fill="none" stroke="var(--line-strong)" strokeWidth="1.4" strokeDasharray="3 7" className="scene-dash">
        <path d="M150 112 C210 150 230 240 262 318" />
        <path d="M430 118 C380 170 330 240 300 318" />
        <path d="M150 262 C200 280 230 300 255 326" />
        <path d="M420 238 C380 270 340 296 306 326" />
        <path d="M280 72 L280 180" />
      </g>

      {/* Desk */}
      <rect x="40" y="378" width="480" height="10" rx="5" fill="var(--line-strong)" />

      {/* Coffee mug with steam */}
      <g>
        <path className="scene-steam" d="M108 318 c-6 -8 6 -14 0 -22" fill="none" stroke="var(--line-strong)" strokeWidth="2.2" strokeLinecap="round" />
        <path className="scene-steam scene-delay-2" d="M122 318 c-6 -8 6 -14 0 -22" fill="none" stroke="var(--line-strong)" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="96" y="326" width="40" height="52" rx="8" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
        <path d="M136 338 h8 a10 10 0 0 1 0 20 h-8" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
        <rect x="104" y="344" width="24" height="4" rx="2" fill="var(--accent)" opacity="0.5" />
      </g>

      {/* Plant */}
      <g>
        <ellipse cx="452" cy="318" rx="10" ry="24" fill="#7fae8a" transform="rotate(-28 452 318)" />
        <ellipse cx="474" cy="314" rx="10" ry="26" fill="#6a9e78" transform="rotate(22 474 314)" />
        <ellipse cx="463" cy="306" rx="9" ry="28" fill="#8cbc97" />
        <path d="M440 340 h46 l-6 38 h-34 z" fill="#c98466" />
      </g>

      {/* Person */}
      <g>
        {/* torso */}
        <path d="M196 378 C196 314 228 290 280 290 C332 290 364 314 364 378 Z" fill="var(--ink)" opacity="0.92" />
        <path d="M262 290 L280 312 L298 290" fill="none" stroke="var(--ink-fg)" strokeWidth="2" opacity="0.5" />
        {/* neck */}
        <rect x="267" y="262" width="26" height="32" rx="10" fill={skinShade} />
        {/* screen glow on face */}
        <ellipse cx="280" cy="236" rx="70" ry="60" fill="url(#screenGlow)" className="scene-glow" />
        {/* head */}
        <circle cx="242" cy="236" r="8" fill={skinShade} />
        <circle cx="318" cy="236" r="8" fill={skinShade} />
        <circle cx="280" cy="232" r="40" fill={skin} />
        {/* hair */}
        <path d="M240 232 C236 196 258 182 284 184 C312 186 326 204 320 228 C314 210 298 202 280 205 C262 208 250 216 240 232 Z" fill={hair} />
        {/* glasses */}
        <g fill="none" stroke={hair} strokeWidth="2.2">
          <rect x="256" y="226" width="20" height="15" rx="6" />
          <rect x="284" y="226" width="20" height="15" rx="6" />
          <path d="M276 232 h8" />
        </g>
        {/* eyes (blink) */}
        <ellipse className="scene-blink" cx="266" cy="233.5" rx="2.6" ry="3" fill={hair} />
        <ellipse className="scene-blink" cx="294" cy="233.5" rx="2.6" ry="3" fill={hair} />
        {/* smile */}
        <path d="M270 252 Q280 259 290 252" fill="none" stroke="#9a5a43" strokeWidth="2.4" strokeLinecap="round" />
        {/* hands typing */}
        <ellipse className="scene-type" cx="220" cy="368" rx="13" ry="8" fill={skin} />
        <ellipse className="scene-type scene-delay-1" cx="340" cy="368" rx="13" ry="8" fill={skin} />
      </g>

      {/* Laptop (lid faces us) */}
      <g>
        <rect x="198" y="306" width="164" height="68" rx="9" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
        <rect x="176" y="372" width="208" height="9" rx="4.5" fill="var(--line-strong)" />
        {/* Dastak door logo on the lid */}
        <g className="scene-glow">
          <rect x="271" y="324" width="18" height="28" rx="2.5" fill="none" stroke="var(--accent)" strokeWidth="2" />
          <circle cx="284" cy="339" r="1.8" fill="var(--accent)" />
        </g>
      </g>

      {/* Calendar chip (top) */}
      <g className="scene-pop" style={{ animationDelay: "1.6s" }}>
        <g className="scene-float scene-dur-3">
          <rect x="206" y="32" width="148" height="40" rx="12" fill="var(--surface)" stroke="var(--line)" className="scene-card" />
          <rect x="220" y="44" width="16" height="16" rx="3.5" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
          <path d="M220 49.5 h16" stroke="var(--accent)" strokeWidth="1.8" />
          <text x="244" y="57" fontSize="12" fontWeight="600" fill="var(--fg)">Survey · Tue 10:00</text>
        </g>
      </g>

      {/* WhatsApp message (left top) */}
      <g className="scene-pop" style={{ animationDelay: "0.2s" }}>
        <g className="scene-float scene-dur-1">
          <rect x="14" y="80" width="176" height="60" rx="14" fill="var(--surface)" stroke="var(--line)" className="scene-card" />
          <circle cx="38" cy="110" r="11" fill="#25d366" opacity="0.9" />
          <path d="M33.5 110 l3 3 l6 -6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="56" y="104" fontSize="10.5" fill="var(--muted)">WhatsApp · just now</text>
          <text x="56" y="121" fontSize="12.5" fontWeight="600" fill="var(--fg)">Need a solar quote?</text>
        </g>
      </g>

      {/* Lead assigned with countdown ring (right top) */}
      <g className="scene-pop" style={{ animationDelay: "0.7s" }}>
        <g className="scene-float scene-dur-2">
          <rect x="366" y="82" width="180" height="62" rx="14" fill="var(--surface)" stroke="var(--line)" className="scene-card" />
          <text x="382" y="106" fontSize="10.5" fill="var(--muted)">New lead · Web form</text>
          <text x="382" y="124" fontSize="12.5" fontWeight="600" fill="var(--fg)">Assigned to Ali</text>
          <circle cx="522" cy="113" r="12" fill="none" stroke="var(--line)" strokeWidth="3" />
          <circle cx="522" cy="113" r="12" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="75.4" className="scene-ring" transform="rotate(-90 522 113)" />
        </g>
      </g>

      {/* AI assistant typing (left middle) */}
      <g className="scene-pop" style={{ animationDelay: "1.1s" }}>
        <g className="scene-float scene-dur-3">
          <rect x="10" y="232" width="148" height="56" rx="14" fill="var(--surface)" stroke="var(--line)" className="scene-card" />
          <rect x="24" y="248" width="24" height="24" rx="7" fill="var(--ink)" />
          <path d="M30 262 q6 5 12 0" fill="none" stroke="var(--ink-fg)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="32" cy="256" r="1.6" fill="var(--ink-fg)" />
          <circle cx="40" cy="256" r="1.6" fill="var(--ink-fg)" />
          <text x="58" y="256" fontSize="10.5" fill="var(--muted)">AI assistant</text>
          <circle className="scene-typing" cx="62" cy="270" r="2.6" fill="var(--muted)" />
          <circle className="scene-typing scene-delay-1" cx="72" cy="270" r="2.6" fill="var(--muted)" />
          <circle className="scene-typing scene-delay-2" cx="82" cy="270" r="2.6" fill="var(--muted)" />
        </g>
      </g>

      {/* Payment received (right middle) */}
      <g className="scene-pop" style={{ animationDelay: "2s" }}>
        <g className="scene-float scene-dur-1">
          <rect x="398" y="208" width="150" height="58" rx="14" fill="var(--surface)" stroke="var(--line)" className="scene-card" />
          <circle cx="422" cy="237" r="11" fill="var(--success)" opacity="0.9" />
          <path d="M417.5 237 l3 3 l6 -6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="440" y="231" fontSize="10.5" fill="var(--muted)">Payment received</text>
          <text x="440" y="249" fontSize="13" fontWeight="700" fill="var(--fg)">$250.00</text>
        </g>
      </g>
    </svg>
  );
}
