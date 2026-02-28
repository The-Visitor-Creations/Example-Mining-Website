'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type CSSProperties,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useSessionOnce } from '@/hooks/useSessionOnce';

/* ================================================================ */
/* Types                                                             */
/* ================================================================ */

type Phase =
  | 'intro'       // company name + exchange label fade in
  | 'priceRoll'   // stock price digits roll via odometer
  | 'dayChange'   // green day change fades up
  | 'fadeText'    // entire text layer fades out
  | 'blocks'      // block grid drops away
  | 'done';       // overlay removed

interface LoadInOverlayProps {
  /** Company name displayed large and centered */
  companyName: string;
  /** Exchange label displayed beneath name, e.g. "TSXV: AUM" */
  ticker: string;
  /** Stock price string, e.g. "$0.47" */
  stockPrice?: string;
  /** Absolute day change, e.g. "+$0.03" */
  dayChangeAbs?: string;
  /** Percentage day change, e.g. "+6.82%" */
  dayChangePct?: string;
  /** Accent colour for the thin underline between name and ticker */
  accentColor?: string;
  /** Background colour for the overlay and blocks */
  backgroundColor?: string;
  /** Force the animation to replay even if it already ran this session */
  forceReplay?: boolean;
}

/* ================================================================ */
/* Constants                                                         */
/* ================================================================ */

const SESSION_KEY = 'boet-load-overlay';

/** Characters used for the digit odometer scramble strip */
const DIGIT_POOL = '0123456789';

/** Number of random digits shown before the real one in the strip */
const STRIP_RANDOM_COUNT = 8;

/** Height of each character cell in the odometer strip (em) */
const CHAR_CELL_HEIGHT = 1.15;

/* ─── Timing (seconds) ─── */
const INTRO_HOLD = 0.4;             // pause before price roll starts
const ODOMETER_STAGGER = 0.07;      // delay between each digit roll
const ODOMETER_DURATION = 0.6;      // per-digit roll duration
const POST_PRICE_HOLD = 0.15;       // pause after price lands
const DAY_CHANGE_HOLD = 0.6;        // how long day change is visible
const TEXT_FADE_DURATION = 0.2;      // text layer fade-out
const BLOCK_STAGGER = 0.03;         // delay increment per diagonal step
const BLOCK_DROP_DURATION = 0.45;   // each block's fall duration
const BLOCK_DROP_EASE: [number, number, number, number] = [0.76, 0, 0.24, 1];

/* ================================================================ */
/* Helpers                                                           */
/* ================================================================ */

function getColumnCount(w: number): number {
  if (w < 640) return 8;
  if (w < 1024) return 12;
  return 16;
}

interface GridSpec {
  cols: number;
  rows: number;
  blockW: number;
  blockH: number;
  vh: number;
}

function computeGrid(): GridSpec {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cols = getColumnCount(w);
  const blockW = Math.ceil(w / cols);
  const blockH = blockW;
  const rows = Math.ceil(h / blockH) + 1;
  return { cols, rows, blockW, blockH, vh: h };
}

/** Split a price string like "$0.47" into characters, marking which are digits */
function parsePriceChars(price: string): { char: string; isDigit: boolean }[] {
  return price.split('').map((char) => ({
    char,
    isDigit: /[0-9]/.test(char),
  }));
}

/* ================================================================ */
/* OdometerDigit                                                     */
/* ================================================================ */

/**
 * Renders a single digit as a vertical strip of random digits
 * that scrolls upward to reveal the target digit — classic odometer.
 */
function OdometerDigit({
  digit,
  digitIndex,
  onComplete,
}: {
  digit: string;
  digitIndex: number;
  onComplete?: () => void;
}) {
  const sequence = useMemo(() => {
    const randoms = Array.from({ length: STRIP_RANDOM_COUNT }, () =>
      DIGIT_POOL[Math.floor(Math.random() * DIGIT_POOL.length)]
    );
    return [...randoms, digit];
  }, [digit]);

  const scrollY = -(STRIP_RANDOM_COUNT * CHAR_CELL_HEIGHT);

  return (
    <span
      className="inline-block overflow-hidden relative align-bottom"
      style={{ height: `${CHAR_CELL_HEIGHT}em` }}
    >
      <motion.span
        className="flex flex-col"
        initial={{ y: 0 }}
        animate={{ y: `${scrollY}em` }}
        transition={{
          delay: ODOMETER_STAGGER * digitIndex,
          duration: ODOMETER_DURATION,
          ease: [0.33, 1, 0.68, 1],
        }}
        onAnimationComplete={onComplete}
      >
        {sequence.map((c, i) => (
          <span
            key={i}
            className="block text-center"
            style={{
              height: `${CHAR_CELL_HEIGHT}em`,
              lineHeight: `${CHAR_CELL_HEIGHT}em`,
            }}
          >
            {c}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/* ================================================================ */
/* StockPriceOdometer                                                */
/* ================================================================ */

/**
 * Renders the full stock price with odometer-rolling digits
 * and static characters ($, .) in place.
 */
function StockPriceOdometer({
  price,
  onComplete,
}: {
  price: string;
  onComplete: () => void;
}) {
  const chars = useMemo(() => parsePriceChars(price), [price]);

  // Count total digits to know which is last
  const totalDigits = chars.filter((c) => c.isDigit).length;
  let digitIndex = 0;

  return (
    <div
      className="font-mono font-bold leading-none flex items-baseline justify-center"
      style={{
        fontSize: 'clamp(32px, 5vw, 56px)',
        color: '#1a1714',
        minHeight: `${CHAR_CELL_HEIGHT}em`,
      }}
    >
      {chars.map((c, i) => {
        if (!c.isDigit) {
          // Static character ($, .)
          return (
            <span
              key={i}
              className="inline-block"
              style={{
                height: `${CHAR_CELL_HEIGHT}em`,
                lineHeight: `${CHAR_CELL_HEIGHT}em`,
              }}
            >
              {c.char}
            </span>
          );
        }

        const currentDigitIndex = digitIndex;
        const isLast = currentDigitIndex === totalDigits - 1;
        digitIndex++;

        return (
          <OdometerDigit
            key={i}
            digit={c.char}
            digitIndex={currentDigitIndex}
            onComplete={isLast ? onComplete : undefined}
          />
        );
      })}
    </div>
  );
}

/* ================================================================ */
/* BlockGrid                                                         */
/* ================================================================ */

function BlockGrid({
  grid,
  backgroundColor,
}: {
  grid: GridSpec;
  backgroundColor: string;
}) {
  const { cols, rows, blockW, blockH, vh } = grid;

  const blocks = useMemo(() => {
    const items: { r: number; c: number; delay: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        items.push({ r, c, delay: (r + c) * BLOCK_STAGGER });
      }
    }
    return items;
  }, [cols, rows]);

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden pointer-events-none">
      {blocks.map(({ r, c, delay }) => (
        <motion.div
          key={`${r}-${c}`}
          className="absolute will-change-transform"
          style={{
            left: c * blockW,
            top: r * blockH,
            width: blockW + 1,
            height: blockH + 1,
            backgroundColor,
          }}
          initial={{ y: 0 }}
          animate={{ y: vh + blockH }}
          transition={{
            delay,
            duration: BLOCK_DROP_DURATION,
            ease: BLOCK_DROP_EASE,
          }}
        />
      ))}
    </div>
  );
}

/* ================================================================ */
/* LoadInOverlay                                                     */
/* ================================================================ */

export default function LoadInOverlay({
  companyName,
  ticker,
  stockPrice = '$3.42',
  dayChangeAbs = '+$0.18',
  dayChangePct = '+5.56%',
  accentColor = '#9E1B32',
  backgroundColor = '#f5f2ee',
  forceReplay = false,
}: LoadInOverlayProps) {
  /* ─── Session & mount state ─── */
  const [sessionPlayed, markPlayed] = useSessionOnce(SESSION_KEY);
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  /* ─── Animation state ─── */
  const [phase, setPhase] = useState<Phase>('intro');
  const [grid, setGrid] = useState<GridSpec | null>(null);

  /* ─── Mount: compute grid ─── */
  useEffect(() => {
    setMounted(true);
    setGrid(computeGrid());
  }, []);

  const shouldAnimate = mounted && (forceReplay || !sessionPlayed);

  /* ─── Phase: intro → priceRoll ─── */
  useEffect(() => {
    if (!shouldAnimate || phase !== 'intro') return;
    const t = setTimeout(() => setPhase('priceRoll'), INTRO_HOLD * 1000);
    return () => clearTimeout(t);
  }, [shouldAnimate, phase]);

  /* ─── Phase: dayChange → fadeText ─── */
  useEffect(() => {
    if (phase !== 'dayChange') return;
    const t = setTimeout(() => setPhase('fadeText'), DAY_CHANGE_HOLD * 1000);
    return () => clearTimeout(t);
  }, [phase]);

  /* ─── Phase: fadeText → blocks ─── */
  useEffect(() => {
    if (phase !== 'fadeText') return;
    const t = setTimeout(() => setPhase('blocks'), TEXT_FADE_DURATION * 1000 + 30);
    return () => clearTimeout(t);
  }, [phase]);

  /* ─── Phase: blocks → done (timer based on grid size) ─── */
  useEffect(() => {
    if (phase !== 'blocks' || !grid) return;
    const maxDiag = (grid.cols - 1) + (grid.rows - 1);
    const totalMs = (maxDiag * BLOCK_STAGGER + BLOCK_DROP_DURATION) * 1000 + 120;
    const t = setTimeout(() => {
      setPhase('done');
      markPlayed();
    }, totalMs);
    return () => clearTimeout(t);
  }, [phase, grid, markPlayed]);

  /* ─── Reduced motion: skip to done ─── */
  useEffect(() => {
    if (!shouldAnimate || !prefersReducedMotion) return;
    const t = setTimeout(() => {
      setPhase('done');
      markPlayed();
    }, 600);
    return () => clearTimeout(t);
  }, [shouldAnimate, prefersReducedMotion, markPlayed]);

  /* ─── Price roll complete → show day change ─── */
  const handlePriceRollComplete = useCallback(() => {
    setTimeout(() => setPhase('dayChange'), POST_PRICE_HOLD * 1000);
  }, []);

  /* ================================================================ */
  /* Render gates                                                      */
  /* ================================================================ */

  /* Before JS hydrates — show a plain colour screen to prevent FOUC */
  if (!mounted) {
    return (
      <div
        className="fixed inset-0 z-[9999]"
        style={{ backgroundColor }}
        aria-hidden
      />
    );
  }

  /* Session already played (and not force-replaying) — render nothing */
  if (!shouldAnimate) return null;

  /* Animation finished */
  if (phase === 'done') return null;

  /* ================================================================ */
  /* Reduced-motion fallback: simple quick fade                        */
  /* ================================================================ */

  if (prefersReducedMotion) {
    return (
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ backgroundColor }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        aria-hidden
      >
        <div className="text-center px-6">
          <div
            className="text-4xl md:text-6xl font-black uppercase tracking-[0.12em] leading-none"
            style={{ color: '#1a1714' }}
          >
            {companyName}
          </div>
          <div
            className="mt-3 text-xs md:text-sm font-mono tracking-[0.25em] uppercase"
            style={{ color: '#8a7e70' }}
          >
            {ticker}
          </div>
          <div
            className="mt-2 font-mono font-bold"
            style={{ color: '#1a1714', fontSize: 'clamp(32px, 5vw, 56px)' }}
          >
            {stockPrice}
          </div>
          <div
            className="mt-1 font-mono font-semibold"
            style={{ color: '#22c55e', fontSize: 'clamp(12px, 1.3vw, 15px)' }}
          >
            ▲ {dayChangeAbs} ({dayChangePct})
          </div>
        </div>
      </motion.div>
    );
  }

  /* ================================================================ */
  /* Full animation render                                             */
  /* ================================================================ */

  const isTextPhase =
    phase === 'intro' ||
    phase === 'priceRoll' ||
    phase === 'dayChange' ||
    phase === 'fadeText';

  return (
    <>
      {/* ── Solid background (behind text, removed when blocks take over) ── */}
      {isTextPhase && (
        <div
          className="fixed inset-0 z-[9998]"
          style={{ backgroundColor }}
          aria-hidden
        />
      )}

      {/* ── Text layer ── */}
      {isTextPhase && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none select-none"
          style={{ backgroundColor }}
          animate={{ opacity: phase === 'fadeText' ? 0 : 1 }}
          transition={{ duration: TEXT_FADE_DURATION }}
          aria-hidden
        >
          <div className="text-center px-6">
            {/* Company name */}
            <motion.div
              className="text-4xl md:text-6xl lg:text-7xl font-black uppercase tracking-[0.1em] leading-none"
              style={{ color: '#1a1714' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {companyName}
            </motion.div>

            {/* Accent underline */}
            {accentColor && (
              <motion.div
                className="mx-auto mt-4 mb-3.5 rounded-full"
                style={{
                  width: 28,
                  height: 2,
                  backgroundColor: accentColor,
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: 0.3,
                  delay: 0.2,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
              />
            )}

            {/* Exchange label */}
            <motion.div
              className="font-mono tracking-[0.3em] uppercase mb-2.5"
              style={{
                color: '#8a7e70',
                fontSize: 'clamp(10px, 1vw, 12px)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.3 }}
            >
              {ticker}
            </motion.div>

            {/* Stock price odometer */}
            {(phase === 'priceRoll' || phase === 'dayChange' || phase === 'fadeText') && (
              <StockPriceOdometer
                price={stockPrice}
                onComplete={handlePriceRollComplete}
              />
            )}

            {/* Day change in green */}
            <motion.div
              className="flex items-center justify-center gap-2 mt-2 font-mono font-semibold"
              style={{
                color: '#22c55e',
                fontSize: 'clamp(12px, 1.3vw, 15px)',
              }}
              initial={{ opacity: 0, y: 6 }}
              animate={
                phase === 'dayChange' || phase === 'fadeText'
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 6 }
              }
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <span>
                <span className="text-[0.8em] mr-0.5">▲</span>
                {dayChangeAbs}
              </span>
              <span>({dayChangePct})</span>
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* ── Block grid ── */}
      {phase === 'blocks' && grid && (
        <BlockGrid grid={grid} backgroundColor={backgroundColor} />
      )}
    </>
  );
}
