/**
 * DigitalHuman — Live2D WebGL renderer + static PNG fallback.
 *
 * Tries to load the Live2D hibiki model via Live2DCanvas. If WebGL is
 * unavailable or model loading fails, falls back to a styled PNG portrait
 * with CSS animations (breathing, emotion filters).
 */
import { useEffect, useRef, useState, useImperativeHandle, forwardRef, Suspense, lazy } from 'react';
import characterImg from '../../assets/character-portrait.png';
import portraitZenRedGold from '../../assets/portrait-zen-red-gold.png';
import portraitCeladon from '../../assets/portrait-celadon.png';
import portraitTangSplendor from '../../assets/portrait-tang-splendor.png';
import portraitInkWash from '../../assets/portrait-ink-wash.png';
import './DigitalHuman.css';

const Live2DCanvas = lazy(() => import('./Live2DCanvas'));

const PORTRAIT_MAP: Record<string, string> = {
  zen_red_gold: portraitZenRedGold,
  celadon_elegance: portraitCeladon,
  tang_splendor: portraitTangSplendor,
  ink_wash: portraitInkWash,
};

// ---- Web Audio singleton ----------------------------------------------------
let ac: AudioContext | null = null;
let an: AnalyserNode | null = null;
let src: MediaElementAudioSourceNode | null = null;
const buf = new Uint8Array(128);

/**
 * Step 2 (关键): 确保 AudioContext 完全就绪后才允许后续操作。
 * 在 resume() 完成前调用 decodeAudioData 或 start() 会导致开头被吞。
 */
export async function ensureAudioContext(): Promise<{ ctx: AudioContext; analyser: AnalyserNode }> {
  if (!ac) { ac = new AudioContext(); }
  if (!an) {
    an = new AnalyserNode(ac, { fftSize: 256, smoothingTimeConstant: 0.4 });
    an.connect(ac.destination);
  }
  if (ac.state === 'suspended') {
    console.log('[AudioCtx] resuming from suspended...');
    await ac.resume();
    console.log('[AudioCtx] state =', ac.state);
  }
  console.log('[AudioCtx] ready, state =', ac.state);
  return { ctx: ac, analyser: an };
}

/** Legacy: HTML5 <audio> passthrough via createMediaElementSource */
export async function connectAudio(audio: HTMLAudioElement) {
  try {
    const { ctx, analyser } = await ensureAudioContext();
    if (src) { try { src.disconnect(); } catch { /* ok */ } }
    src = ctx.createMediaElementSource(audio);
    src.connect(analyser);
  } catch { /* ok */ }
}

function readVolume(): number {
  if (!an) return 0;
  an.getByteTimeDomainData(buf as any);
  let s = 0;
  for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
  return Math.sqrt(s / buf.length);
}

// ---- style preset → CSS variables -------------------------------------------
const STYLE_VARS: Record<string, Record<string, string>> = {
  zen_red_gold: { '--dh-primary': '#c41d7f', '--dh-accent': '#e91e63', '--dh-glow': 'rgba(255,200,180,0.22)', '--dh-ring': 'rgba(196,29,127,0.5)' },
  celadon_elegance: { '--dh-primary': '#2e7d5b', '--dh-accent': '#4caf9e', '--dh-glow': 'rgba(180,220,200,0.25)', '--dh-ring': 'rgba(46,125,91,0.5)' },
  tang_splendor: { '--dh-primary': '#b8860b', '--dh-accent': '#d4a853', '--dh-glow': 'rgba(255,220,140,0.28)', '--dh-ring': 'rgba(184,134,11,0.5)' },
  ink_wash: { '--dh-primary': '#455a7b', '--dh-accent': '#6b8db5', '--dh-glow': 'rgba(180,200,230,0.20)', '--dh-ring': 'rgba(69,90,123,0.5)' },
};

// ---- types ------------------------------------------------------------------
export interface DigitalHumanHandle {
  setExpression: (name: string) => void;
}

interface Props {
  emotion?: string;
  isSpeaking?: boolean;
  size?: 'normal' | 'large';
  visemeId?: number;
  stylePreset?: string;
}

// ---- component --------------------------------------------------------------
const DigitalHuman = forwardRef<DigitalHumanHandle, Props>(
  ({ emotion = 'idle', isSpeaking = false, size = 'large', visemeId = 0, stylePreset = 'zen_red_gold' }, ref) => {
    const vars = STYLE_VARS[stylePreset] || STYLE_VARS.zen_red_gold;
    const portraitSrc = PORTRAIT_MAP[stylePreset] || characterImg;

    // Live2D state
    const [live2dOk, setLive2dOk] = useState(true);  // start optimistic
    const [live2dLoaded, setLive2dLoaded] = useState(false);

    // Static image state
    const [imgOk, setImgOk] = useState(false);
    const [imgErr, setImgErr] = useState(false);

    const ringRef = useRef<HTMLDivElement>(null);

    // ---- audio-reactive ring pulse ------------------------------------------
    useEffect(() => {
      const loop = () => {
        if (ringRef.current) {
          const vol = isSpeaking ? readVolume() : 0;
          const pulse = isSpeaking ? 0.3 + vol * 1.5 : 0;
          ringRef.current.style.opacity = String(pulse);
          ringRef.current.style.transform = `scale(${1 + pulse * 0.06})`;
        }
        requestAnimationFrame(loop);
      };
      const raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }, [isSpeaking]);

    useImperativeHandle(ref, () => ({ setExpression: () => {} }), []);

    // ---- derived class names ------------------------------------------------
    const showLive2D = live2dOk;
    const dhCls = `dh-char dh-char--${size} dh-char--${stylePreset} ${isSpeaking ? 'dh-char--speaking' : ''}`;

    return (
      <div className={dhCls} style={vars as React.CSSProperties}>
        {/* Ambient glow (behind character) */}
        <div className="dh-char__glow" />

        {/* Sound bars (above character when speaking) */}
        {isSpeaking && (
          <div className="dh-char__bars">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="dh-char__bar" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        )}

        {/* ── Character area ─────────────────────────────── */}
        <div className="dh-char__frame-wrap">
          {/* Breathing ring */}
          <div ref={ringRef} className="dh-char__ring" />

          {/* Live2D canvas OR static image */}
          <div className="dh-char__frame">
            {showLive2D && (
              <Suspense fallback={null}>
                <Live2DCanvas
                  width={260}
                  height={340}
                  emotion={emotion}
                  isSpeaking={isSpeaking}
                  visemeId={visemeId}
                  onLoaded={() => setLive2dLoaded(true)}
                  onError={() => setLive2dOk(false)}
                />
              </Suspense>
            )}

            {/* Static PNG fallback — shown while Live2D loading OR on error */}
            {(!live2dOk || !live2dLoaded) && !imgErr && (
              <img
                src={portraitSrc}
                alt="灵小禅"
                className={`dh-char__img ${imgOk ? 'loaded' : ''}`}
                onLoad={() => setImgOk(true)}
                onError={() => setImgErr(true)}
              />
            )}

            {/* Ultimate fallback — emoji placeholder */}
            {(!live2dOk || !live2dLoaded) && imgErr && (
              <div className="dh-char__fallback">
                <span>🏯</span>
                <span>灵小禅</span>
                <span>AI 导游</span>
              </div>
            )}

            {/* Blush overlay (works on both Live2D and static) */}
            <div className="dh-char__blush" />
          </div>
        </div>

        {/* Particles (when speaking) */}
        {isSpeaking && (
          <div className="dh-char__particles">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className="dh-char__particle" style={{
                left: `${20 + Math.random() * 60}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${1.5 + Math.random() * 3}s`,
              }} />
            ))}
          </div>
        )}

        {/* Nameplate */}
        <div className="dh-char__info">
          <span className="dh-char__name">灵小禅</span>
          <span className="dh-char__role">AI 数字人导游</span>
          <span className={`dh-char__status ${isSpeaking ? 'active' : ''}`}>
            {isSpeaking ? '● 讲解中' : '○ 待机'}
          </span>
        </div>
      </div>
    );
  }
);

DigitalHuman.displayName = 'DigitalHuman';
export default DigitalHuman;
