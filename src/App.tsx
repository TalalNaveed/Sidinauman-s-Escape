/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * EXTREME SIDI RUN — Arabian Nights Edition
 * Complete overhaul: branching paths, Web Audio music, particle FX, new obstacles
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Shield, FastForward, VolumeX, Volume2 } from 'lucide-react';

// Polyfill roundRect for browsers that don't support it yet
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  (CanvasRenderingContext2D.prototype as any).roundRect = function(
    x: number, y: number, w: number, h: number, r: number | number[] = 0
  ) {
    const rad = typeof r === 'number' ? r : (r[0] ?? 0);
    const cr = Math.min(rad, w / 2, h / 2);
    this.moveTo(x + cr, y);
    this.lineTo(x + w - cr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + cr);
    this.lineTo(x + w, y + h - cr);
    this.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
    this.lineTo(x + cr, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - cr);
    this.lineTo(x, y + cr);
    this.quadraticCurveTo(x, y, x + cr, y);
    this.closePath();
  };
}

// ─────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────

type GameState =
  | 'START'
  | 'INTRO_GRAVE'
  | 'STAGE1'
  | 'CHOICE_1'
  | 'STAGE_COURT'
  | 'SULTAN_SEQ'
  | 'STAGE_ALLEY'
  | 'TRANSFORM_DOG_SEQ'
  | 'STAGE2'
  | 'STAGE2_BAKER'
  | 'CHOICE_2'
  | 'DOG_HOME_SEQ'
  | 'STAGE3'
  | 'RPS_BATTLE'
  | 'TRANSFORM_HORSE_SEQ'
  | 'RPS_LOSS_SEQ'
  | 'ENDING_VICTORY'
  | 'ENDING_BAKER'
  | 'ENDING_DEFEAT'
  | 'CAUGHT'
  | 'CAUGHT_STAGE3';

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

type RPSMove = 'ROCK' | 'PAPER' | 'SCISSORS';
type RPSOutcome = 'WIN' | 'LOSE' | 'DRAW';
type RPSPhase = 'INTRO' | 'CHOOSING' | 'REVEAL' | 'RESULT';

type ObstacleType =
  | 'BASKET' | 'STALL' | 'POT' | 'WALL'
  | 'CAMEL' | 'BALCONY' | 'SPRINGBOARD'
  | 'LAMP' | 'CARPET' | 'GUARD';

const CW = 800;
const CH = 450;
const GY = 375;
const GRAVITY = 0.75;
const JUMP_FORCE = -17;
// Jump feel helpers:
// - Buffer: pressing jump shortly before landing still triggers a jump.
// - Coyote time: pressing jump shortly after leaving ground still triggers.
const JUMP_BUFFER_MS = 140;
const COYOTE_TIME_MS = 110;
const BASE_SPEED = 9;
const CHASER_SPEED = BASE_SPEED + 0.5;
const SPEED_BOOST_MULT = 1.3;
const SPEED_BOOST_MS = 4500;
// Slightly favor SPEED over SHIELD (was ~50/50). Keep it subtle.
const EXTRA_SPEED_POWERUP_CHANCE = 0.15;
// On HARD, slightly favor SHIELD to keep runs fair.
const EXTRA_SHIELD_POWERUP_CHANCE_HARD = 0.5;
const PLAYER_X = 240;
const INITIAL_DISTANCE = 1400;

const BAKER_ENDINGS: Array<{ title: string; body: Array<React.ReactNode> }> = [
  {
    title: "The Fortune of the Baker's Dog",
    body: [
      <>Sidi Numan chose to remain with his kind master, Hassan the Baker. Though trapped in the body of a dog, his human mind stayed sharp as a blade.</>,
      <>He learned to scratch the ground three times before false coins — and the baker, baffled at first, soon grew rich exposing cheats. Word spread through the souk: <span className="text-amber-300 font-bold">the baker's dog could smell a liar's gold</span>.</>,
      <>Merchants came from Basra, from Aleppo, from distant Samarkand, paying handsomely for the dog's verdict. Hassan built a grand shop. He gave Sidi a cushioned throne by the door and fed him only the finest meats.</>,
      <>They say Sidi lived twenty more years in that form — respected, beloved, never hungry. Some say he was happier as a dog than he had ever been as a husband. <span className="text-amber-300">Not every cage is a prison.</span></>,
    ],
  },
  {
    title: "The Baker's Quiet Miracle",
    body: [
      <>Sidi Numan stayed beside Hassan the Baker, trading vengeance for warmth. In time, the baker stopped calling him “dog” and began to say, softly, “friend.”</>,
      <>Each dawn, Sidi would paw at sacks of flour that had been watered down — and Hassan learned to trust those small warnings more than any merchant's smile.</>,
      <>Soon the neighborhood whispered of a shop that never cheated and was never cheated. The oven glowed; the bread was honest; and a watchful dog sat by the door like a judge who could not be bribed.</>,
      <>Amina's shadow never vanished completely, but it never entered that doorway again. Sometimes survival is its own triumph — and sometimes peace is the bravest ending.</>,
    ],
  },
  {
    title: "Hassan and the Clever Hound",
    body: [
      <>Sidi Numan remained in the baker's district, where the streets smelled of sesame and smoke instead of grave-dirt. The curse did not break — but life, strangely, did not break either.</>,
      <>When thieves crept close, Sidi would cough and whine in just the right rhythm; when danger passed, he would sit again as if nothing had happened. Before long, even the roughest boys crossed the street rather than test the baker's dog.</>,
      <>Hassan grew prosperous, yes — but more than that, he grew careful with his riches, sharing bread during hard seasons. The dog beside him became a small legend of the quarter.</>,
      <>Years later, travelers still asked to see the clever hound who guarded an honest oven. And Sidi, in his quiet way, learned that a story can be redeemed even when a body cannot.</>,
    ],
  },
];

interface Dialogue { text: string; speaker: 'SIDI' | 'AMINA' | 'NARRATOR' | 'WOMAN' | 'BAKER'; }
interface Obstacle { x: number; y: number; width: number; height: number; type: ObstacleType; vy?: number; }
interface PowerUp { x: number; y: number; type: 'SHIELD' | 'SPEED' | 'MAGIC'; active: boolean; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }
interface Star { x: number; y: number; size: number; phase: number; }

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [distance, setDistance] = useState(0);
  const [isStunned, setIsStunned] = useState(false);
  const [hasShield, setHasShield] = useState(false);
  const [speedBoost, setSpeedBoost] = useState(1);
  const [screenShake, setScreenShake] = useState(0);
  const [currentDialogue, setCurrentDialogue] = useState<Dialogue | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [stageTitle, setStageTitle] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [bakerEndingIdx, setBakerEndingIdx] = useState(0);

  // Final duel — Rock / Paper / Scissors
  const [rpsPhase, setRpsPhase] = useState<RPSPhase>('INTRO');
  const [playerRps, setPlayerRps] = useState<RPSMove | null>(null);
  const [aminaRps, setAminaRps] = useState<RPSMove | null>(null);
  const [rpsOutcome, setRpsOutcome] = useState<RPSOutcome | null>(null);
  const rpsPhaseRef = useRef<RPSPhase>('INTRO');
  const playerRpsCountsRef = useRef<Record<RPSMove, number>>({ ROCK: 0, PAPER: 0, SCISSORS: 0 });
  const rpsTimeoutsRef = useRef<number[]>([]);

  // Cutscenes schedule many timeouts; track them so Play Again / resets can
  // reliably cancel any pending state changes.
  const cutsceneTimeoutsRef = useRef<number[]>([]);

  const stageTitleTimeoutRef = useRef<number | null>(null);
  const lastStageTitleTriggerRef = useRef<{ stage: GameState | null; at: number }>({ stage: null, at: 0 });
  const shownStageTitlesRef = useRef<Set<GameState>>(new Set());
  const shownStageTitleTextsRef = useRef<Set<string>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const cutsceneStep = useRef(0);
  const bgOffset = useRef(0);
  const lastObstacleX = useRef(0);
  const lastPowerUpX = useRef(0);
  const lastStage = useRef<GameState>('STAGE1');
  const isMutedRef = useRef(false);
  const isPausedRef = useRef(false);
  const difficultyRef = useRef<Difficulty>('MEDIUM');
  const savedMusicKey = useRef('dubai');

  const lastGroundedAtRef = useRef(0);
  const lastJumpPressedAtRef = useRef(-Infinity);

  const chaseMusicUrl = '/chase_music.mp4';
  const dubaiMusicUrl = (process.env as any).DUBAI_MUSIC_URL as string | undefined;
  const bgmElRef = useRef<HTMLAudioElement | null>(null);

  // Web Audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentMusicKey = useRef('');

  // Game object refs
  const playerRef = useRef({ x: PLAYER_X, y: GY - 80, vy: 0, isJumping: false, width: 50, height: 80, frame: 0, stunTimer: 0, shieldTimer: 0, speedTimer: 0 });
  const enemyRef = useRef({ distance: INITIAL_DISTANCE, height: 90 });
  const obstaclesRef = useRef<Obstacle[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);

  // Internal state refs (avoid stale closures in update)
  const gsRef = useRef<GameState>('START');
  const distRef = useRef(0);
  const stageSegmentStartDistRef = useRef(0);
  const shieldRef = useRef(false);
  const speedRef = useRef(1);
  const shakeRef = useRef(0);

  useEffect(() => { gsRef.current = gameState; }, [gameState]);
  useEffect(() => { distRef.current = distance; }, [distance]);
  useEffect(() => { shieldRef.current = hasShield; }, [hasShield]);
  useEffect(() => { speedRef.current = speedBoost; }, [speedBoost]);
  useEffect(() => { shakeRef.current = screenShake; }, [screenShake]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  useEffect(() => { rpsPhaseRef.current = rpsPhase; }, [rpsPhase]);

  // Generate static stars once
  useEffect(() => {
    starsRef.current = Array.from({ length: 120 }, (_, i) => ({
      x: Math.random() * CW,
      y: Math.random() * (GY - 80),
      size: 0.5 + Math.random() * 2.0,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);

  // ─────────────────────────────────────────────
  // WEB AUDIO — CHASE MUSIC ENGINE
  // ─────────────────────────────────────────────

  const getCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  const startMusic = useCallback((key: string) => {
    const startProcedural = () => {
      if (currentMusicKey.current === key) return;
      currentMusicKey.current = key;
      if (key) savedMusicKey.current = key;
      if (musicIntervalRef.current) clearInterval(musicIntervalRef.current);
      if (isMutedRef.current) return;
      try {
        const ctx = getCtx();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});

        // A natural minor scale — dark, intense, works for chase
        const S = [110.0, 123.47, 130.81, 146.83, 164.81, 174.61, 185.00, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00];

        type Cfg = { mel: number[]; bpm: number; vol: number; };
        const CFGS: Record<string, Cfg> = {
          intro:  { mel:[4,6,4,2,0,2,4,7,6,4], bpm:74, vol:0.07 },
          stage1: { mel:[8,11,10,8,7,8,11,10,8,6,7,8,10,11,10,8], bpm:138, vol:0.10 },
          court:  { mel:[12,14,15,14,12,11,12,14,15,12,10,11,12,14,15,14], bpm:172, vol:0.11 },
          stage2: { mel:[4,6,5,4,6,8,7,6,4,5,6,4], bpm:116, vol:0.09 },
          stage3: { mel:[12,15,14,12,11,12,15,14,12,10,11,12,15,14,12,11], bpm:180, vol:0.11 },
          baker:  { mel:[4,7,8,7,6,4,6,7], bpm:92, vol:0.07 },
          alley:  { mel:[8,10,11,10,8,6,7,8,10,11,10,8], bpm:148, vol:0.10 },
          // Original (procedural) flute-only chase cue.
          // NOTE: This is not a recreation of any copyrighted recording.
          dubai:  { mel:[12,14,15,14,12,11,12,10, 12,14,15,14,12,11,12,14, 15,14,12,11,10,11,12,14], bpm:132, vol:0.10 },
        };

        const cfg = CFGS[key] ?? CFGS.stage1;
        const beat = 60 / cfg.bpm;
        const AHEAD = 0.45;
        const clock = { mel: ctx.currentTime + 0.06, drum: ctx.currentTime + 0.06, mn: 0, dn: 0 };

        // Helpers defined inline (no external deps needed)
        const schedNote = (c: AudioContext, f: number, t: number, d: number, v: number, mode: 'FLUTE' | 'BLADE' = 'BLADE') => {
          const o = c.createOscillator();
          o.type = mode === 'FLUTE' ? 'triangle' : 'sawtooth';
          o.frequency.value = f;

          // Gentle vibrato for flute feel
          let lfo: OscillatorNode | null = null;
          let lfoGain: GainNode | null = null;
          if (mode === 'FLUTE') {
            lfo = c.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 5.2;
            lfoGain = c.createGain();
            lfoGain.gain.value = 7; // cents-ish at these freqs
            lfo.connect(lfoGain);
            lfoGain.connect(o.frequency);
          }

          const g = c.createGain();
          const amp = mode === 'FLUTE' ? v * 0.85 : v;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(amp, t + (mode === 'FLUTE' ? 0.04 : 0.016));
          // More legato for flute
          g.gain.setValueAtTime(amp, t + d * (mode === 'FLUTE' ? 0.88 : 0.6));
          g.gain.linearRampToValueAtTime(0.0001, t + d);

          // Filter: soften harmonics for flute
          const f1 = c.createBiquadFilter();
          f1.type = mode === 'FLUTE' ? 'lowpass' : 'lowpass';
          f1.frequency.value = mode === 'FLUTE' ? 2200 : 4800;
          f1.Q.value = mode === 'FLUTE' ? 0.7 : 0.2;

          o.connect(f1);
          f1.connect(g);
          g.connect(c.destination);

          if (lfo) { lfo.start(t); lfo.stop(t + d + 0.02); }
          o.start(t);
          o.stop(t + d + 0.02);
        };
        const schedKick = (c: AudioContext, t: number) => {
          const o = c.createOscillator(); o.type = 'sine';
          o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
          const g = c.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.3);
        };
        const schedHat = (c: AudioContext, t: number) => {
          try {
            const len = Math.ceil(c.sampleRate * 0.032);
            const buf = c.createBuffer(1, len, c.sampleRate);
            const dd = buf.getChannelData(0);
            for (let i = 0; i < len; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / len);
            const src = c.createBufferSource(); src.buffer = buf;
            const flt = c.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 7500;
            const g = c.createGain(); g.gain.value = 0.08;
            src.connect(flt); flt.connect(g); g.connect(c.destination); src.start(t);
          } catch {}
        };

        const scheduler = () => {
          if (isMutedRef.current) return;
          try {
            const c = getCtx();
            // Melody
            while (clock.mel < c.currentTime + AHEAD) {
              const isFlute = key === 'dubai';
              schedNote(c, S[cfg.mel[clock.mn % cfg.mel.length]], clock.mel, beat * (isFlute ? 0.98 : 0.7), cfg.vol, isFlute ? 'FLUTE' : 'BLADE');
              clock.mel += beat; clock.mn++;
            }
            // Drums: disabled for flute-only cue
            if (key !== 'dubai') {
              while (clock.drum < c.currentTime + AHEAD) {
                if (clock.dn % 2 === 0) schedKick(c, clock.drum);
                else schedHat(c, clock.drum);
                clock.drum += beat / 2; clock.dn++;
              }
            }
          } catch {}
        };
        scheduler();
        musicIntervalRef.current = setInterval(scheduler, 50);
      } catch {}
    };

    // Prefer a real audio track from public/chase_music.mp4.
    // Falls back to procedural if the browser can't play it or playback fails.
    const preferredUrl = chaseMusicUrl || dubaiMusicUrl;
    if (preferredUrl) {
      try {
        const probe = document.createElement('audio');
        // Most browsers report mp4/m4a support via audio/mp4.
        const canPlay = preferredUrl.endsWith('.mp4') ? probe.canPlayType('audio/mp4') : 'probably';
        if (canPlay) {
          const absoluteSrc = new URL(preferredUrl, window.location.href).toString();
          if (!bgmElRef.current || bgmElRef.current.src !== absoluteSrc) {
            const el = new Audio(preferredUrl);
            el.loop = true;
            el.preload = 'auto';
            el.crossOrigin = 'anonymous';
            el.volume = 0.55;
            bgmElRef.current = el;
          }
          if (isMutedRef.current) return;
          // Play can fail if the browser hasn't received a user gesture yet.
          // In that case, the next button click/tap will call startMusic again.
          bgmElRef.current.play().then(() => {
            currentMusicKey.current = 'REAL_AUDIO';
            if (musicIntervalRef.current) { clearInterval(musicIntervalRef.current); musicIntervalRef.current = null; }
          }).catch(() => {
            startProcedural();
          });
          currentMusicKey.current = 'REAL_AUDIO';
          if (musicIntervalRef.current) { clearInterval(musicIntervalRef.current); musicIntervalRef.current = null; }
          return;
        }
      } catch {
        // fall through
      }
    }

    startProcedural();
  }, [chaseMusicUrl, dubaiMusicUrl, getCtx]);

  const stopMusic = useCallback(() => {
    if (musicIntervalRef.current) { clearInterval(musicIntervalRef.current); musicIntervalRef.current = null; }
    currentMusicKey.current = '';

    if (bgmElRef.current) {
      try { bgmElRef.current.pause(); } catch {}
    }
  }, []);

  const playSFX = useCallback((type: 'jump' | 'hit' | 'powerup' | 'transform' | 'spring' | 'rps_select' | 'rps_reveal' | 'rps_win' | 'rps_lose' | 'rps_draw') => {
    if (isMutedRef.current) return;
    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const n = (f: number, d: number, t: number, v: number, tp: OscillatorType = 'sine') => {
        const o = ctx.createOscillator(); o.type = tp; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d + 0.01);
      };
      if (type === 'jump') { n(440, 0.1, now, 0.08); n(660, 0.08, now + 0.05, 0.06); }
      else if (type === 'hit') {
        n(110, 0.28, now, 0.15, 'sawtooth');
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(180, now); o.frequency.exponentialRampToValueAtTime(38, now + 0.22);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.35, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        o.connect(g); g.connect(ctx.destination); o.start(now); o.stop(now + 0.3);
      }
      else if (type === 'powerup') { [523, 659, 784, 1047].forEach((f, i) => n(f, 0.14, now + i * 0.07, 0.1)); }
      else if (type === 'transform') { for (let i = 0; i < 8; i++) n(440 * Math.pow(0.85, i), 0.32, now + i * 0.09, 0.12, 'sawtooth'); }
      else if (type === 'spring') { n(880, 0.07, now, 0.09); n(1174, 0.09, now + 0.04, 0.07); }
      else if (type === 'rps_select') { n(392, 0.06, now, 0.12); n(784, 0.08, now + 0.04, 0.08); }
      else if (type === 'rps_reveal') { n(196, 0.18, now, 0.14, 'triangle'); n(98, 0.22, now + 0.06, 0.10, 'sine'); }
      else if (type === 'rps_draw')   { [330, 330, 330].forEach((f, i) => n(f, 0.07, now + i * 0.09, 0.10, 'square')); }
      else if (type === 'rps_win')    { [523, 659, 784, 1047].forEach((f, i) => n(f, 0.12, now + i * 0.06, 0.12)); }
      else if (type === 'rps_lose')   { n(220, 0.22, now, 0.14, 'sawtooth'); n(164, 0.26, now + 0.06, 0.12, 'sawtooth'); n(110, 0.3, now + 0.12, 0.10, 'sawtooth'); }
    } catch {}
  }, [getCtx]);

  const clearRpsTimeouts = useCallback(() => {
    rpsTimeoutsRef.current.forEach(t => { try { window.clearTimeout(t); } catch {} });
    rpsTimeoutsRef.current = [];
  }, []);

  const clearCutsceneTimeouts = useCallback(() => {
    cutsceneTimeoutsRef.current.forEach(t => { try { window.clearTimeout(t); } catch {} });
    cutsceneTimeoutsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearRpsTimeouts();
      clearCutsceneTimeouts();
    };
  }, [clearCutsceneTimeouts, clearRpsTimeouts]);

  const enterRpsBattle = useCallback(() => {
    try { setIsPaused(false); } catch {}
    isPausedRef.current = false;
    clearRpsTimeouts();
    setPlayerRps(null);
    setAminaRps(null);
    setRpsOutcome(null);
    setRpsPhase('INTRO');
    setCurrentDialogue(null);
    // Update ref immediately so the RAF loop doesn't re-trigger.
    gsRef.current = 'RPS_BATTLE';
    setGameState('RPS_BATTLE');

    // A quick beat before player input for a dramatic “face-off”.
    const t1 = window.setTimeout(() => {
      setRpsPhase('CHOOSING');
      playSFX('rps_reveal');
    }, 650);
    rpsTimeoutsRef.current.push(t1);
  }, [clearRpsTimeouts, playSFX]);

  const resolveRps = useCallback((p: RPSMove, a: RPSMove): RPSOutcome => {
    if (p === a) return 'DRAW';
    if (p === 'ROCK' && a === 'SCISSORS') return 'WIN';
    if (p === 'PAPER' && a === 'ROCK') return 'WIN';
    if (p === 'SCISSORS' && a === 'PAPER') return 'WIN';
    return 'LOSE';
  }, []);

  const pickAminaMove = useCallback((): RPSMove => {
    const moves = ['ROCK', 'PAPER', 'SCISSORS'] as const;

    // Fair opponent: choose uniformly at random (independent of player choice).
    // Prefer crypto RNG when available; fall back to Math.random.
    const cryptoObj = window.crypto;
    if (cryptoObj?.getRandomValues) {
      const buf = new Uint32Array(1);
      const range = 0x100000000; // 2^32
      const limit = range - (range % moves.length);
      let v = limit;
      while (v >= limit) {
        cryptoObj.getRandomValues(buf);
        v = buf[0];
      }
      return moves[v % moves.length];
    }

    return moves[Math.floor(Math.random() * moves.length)];
  }, []);

  const chooseRpsMove = useCallback((move: RPSMove) => {
    if (gsRef.current !== 'RPS_BATTLE') return;
    const phase = rpsPhaseRef.current;
    if (phase !== 'CHOOSING') return;

    clearRpsTimeouts();
    playSFX('rps_select');
    setRpsPhase('REVEAL');
    setPlayerRps(move);
    setAminaRps(null);
    setRpsOutcome(null);
    playerRpsCountsRef.current[move] = (playerRpsCountsRef.current[move] ?? 0) + 1;

    const tReveal = window.setTimeout(() => {
      const am = pickAminaMove();
      setAminaRps(am);
      const out = resolveRps(move, am);
      setRpsOutcome(out);
      setRpsPhase('RESULT');
      playSFX(out === 'WIN' ? 'rps_win' : out === 'LOSE' ? 'rps_lose' : 'rps_draw');

      // Cinematic follow-through
      if (out === 'DRAW') {
        const tAgain = window.setTimeout(() => {
          setPlayerRps(null);
          setAminaRps(null);
          setRpsOutcome(null);
          setRpsPhase('CHOOSING');
        }, 950);
        rpsTimeoutsRef.current.push(tAgain);
      } else if (out === 'WIN') {
        const tWin = window.setTimeout(() => {
          setGameState('TRANSFORM_HORSE_SEQ');
          cutsceneStep.current = 0;
        }, 1250);
        rpsTimeoutsRef.current.push(tWin);
      } else {
        const tLose = window.setTimeout(() => {
          setGameState('RPS_LOSS_SEQ');
          cutsceneStep.current = 0;
        }, 1250);
        rpsTimeoutsRef.current.push(tLose);
      }
    }, 650);
    rpsTimeoutsRef.current.push(tReveal);
  }, [clearRpsTimeouts, pickAminaMove, playSFX, resolveRps]);

  // ─────────────────────────────────────────────
  // PARTICLES
  // ─────────────────────────────────────────────

  const spawnFX = useCallback((x: number, y: number, n: number, color: string) => {
    for (let i = 0; i < n; i++) {
      particlesRef.current.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 5,
        vy: -(Math.random() * 4 + 1),
        life: 1,
        color,
        size: Math.random() * 5 + 2,
      });
    }
  }, []);

  // ─────────────────────────────────────────────
  // RESET / START GAME
  // ─────────────────────────────────────────────

  const showStageTitle = useCallback((stage: GameState) => {
    const titles: Partial<Record<GameState, string>> = {
      STAGE1: 'Stage I — Flight Through Baghdad',
      STAGE_ALLEY: 'Stage I — The Old Quarter',
      STAGE_COURT: 'Stage II — The Sultan\'s Quarter',
      STAGE2: 'Stage II — The Dog\'s Journey',
      // Keep Stage II as one continuous story: no separate baker banner.
      // Mapping to the same title ensures no extra card appears at the transition.
      STAGE2_BAKER: 'Stage II — The Dog\'s Journey',
      STAGE3: 'Stage III — The Final Chase',
    };
    const title = titles[stage];
    if (!title) return;

    // Extra safety: dedupe by text too (guards against any accidental
    // re-mount/re-entry paths that might map different states to the same title).
    if (shownStageTitleTextsRef.current.has(title)) return;

    // Show each stage title at most once per run (prevents visible duplicates
    // even if a stage transition is accidentally triggered more than once).
    if (shownStageTitlesRef.current.has(stage)) return;
    shownStageTitlesRef.current.add(stage);
    shownStageTitleTextsRef.current.add(title);

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const last = lastStageTitleTriggerRef.current;
    // Guard against accidental double-trigger (e.g., dev StrictMode / double RAF).
    if (last.stage === stage && now - last.at < 500) return;
    lastStageTitleTriggerRef.current = { stage, at: now };

    if (stageTitleTimeoutRef.current !== null) {
      window.clearTimeout(stageTitleTimeoutRef.current);
      stageTitleTimeoutRef.current = null;
    }

    setStageTitle(title);
    stageTitleTimeoutRef.current = window.setTimeout(() => {
      setStageTitle(null);
      stageTitleTimeoutRef.current = null;
    }, 3200);
  }, []);

  const resetGame = useCallback((stage: GameState) => {
    // Cancel any pending timeouts that could override a fresh state.
    clearRpsTimeouts();
    clearCutsceneTimeouts();
    // Synchronously update refs so the game loop sees the new state
    // immediately on the next frame, without waiting for React re-render.
    distRef.current = 0;
    stageSegmentStartDistRef.current = 0;
    gsRef.current = stage;
    if (stage.startsWith('STAGE')) lastStage.current = stage;
    const isDog = stage === 'STAGE2' || stage === 'STAGE2_BAKER';

    playerRef.current = {
      x: PLAYER_X, y: GY - (isDog ? 46 : 80),
      vy: 0, isJumping: false,
      width: isDog ? 68 : 50, height: isDog ? 46 : 80,
      frame: 0, stunTimer: 0, shieldTimer: 0, speedTimer: 0,
    };

    // Reset jump timing helpers so early “buffered” inputs don't carry over.
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    lastGroundedAtRef.current = now;
    lastJumpPressedAtRef.current = -Infinity;
    const startDist: Partial<Record<GameState, number>> = {
      STAGE1: 750,
      STAGE_ALLEY: 720,
      STAGE_COURT: 750,
      // Dog stages felt unfairly fast; give more buffer at the start.
      STAGE2: 560,
      STAGE2_BAKER: 440,
      STAGE3: 680,
    };
    enemyRef.current = { distance: startDist[stage] ?? INITIAL_DISTANCE, height: 90 };
    obstaclesRef.current = [];
    powerUpsRef.current = [];
    particlesRef.current = [];
    bgOffset.current = 0;
    cutsceneStep.current = 0;
    lastObstacleX.current = CW;
    lastPowerUpX.current = CW + 1500;

    setDistance(0);
    setIsStunned(false);
    setHasShield(false);
    setSpeedBoost(1);
    setCurrentDialogue(null);
    setScreenShake(0);
    setGameState(stage);

    try { showStageTitle(stage); } catch {}

    const musicMap: Partial<Record<GameState, string>> = {
      INTRO_GRAVE: 'dubai', STAGE1: 'dubai',
      STAGE_ALLEY: 'dubai', STAGE_COURT: 'dubai',
      STAGE2: 'dubai', STAGE2_BAKER: 'dubai', STAGE3: 'dubai',
    };
    const mKey = musicMap[stage];
    try {
      if (mKey) startMusic(mKey);
      else stopMusic();
    } catch {}
  }, [clearCutsceneTimeouts, clearRpsTimeouts, showStageTitle, startMusic, stopMusic]);

  const transitionStage = useCallback((stage: GameState) => {
    // Soft transition: keep current distance/background/enemy proximity, but
    // swap obstacle set + title card. Used to avoid “stage restarted” feel.
    gsRef.current = stage;
    if (stage.startsWith('STAGE')) lastStage.current = stage;
    stageSegmentStartDistRef.current = distRef.current;

    obstaclesRef.current = [];
    powerUpsRef.current = [];
    particlesRef.current = [];
    lastObstacleX.current = bgOffset.current + CW;
    lastPowerUpX.current = bgOffset.current + CW + 1500;

    setCurrentDialogue(null);
    setGameState(stage);

    showStageTitle(stage);

    // Ensure music is running (actual audio track is preferred in startMusic).
    try { startMusic(savedMusicKey.current); } catch {}
  }, [showStageTitle, startMusic]);

  const doJumpNow = useCallback(() => {
    const p = playerRef.current;
    p.vy = JUMP_FORCE;
    p.isJumping = true;
    playSFX('jump');
  }, [playSFX]);

  const jump = useCallback(() => {
    const p = playerRef.current;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    lastJumpPressedAtRef.current = now;
    if (p.stunTimer > 0) return;

    const canJumpNow = !p.isJumping || (now - lastGroundedAtRef.current <= COYOTE_TIME_MS);
    if (canJumpNow) {
      lastJumpPressedAtRef.current = -Infinity;
      doJumpNow();
    }
  }, [doJumpNow]);

  const tryAgain = useCallback(() => {
    const raw = lastStage.current.startsWith('STAGE') ? lastStage.current : 'STAGE1';
    // Stage II should be one continuous “dog story”. If the player is caught
    // in the baker segment, restart from the start of the dog journey so the
    // banner/choice sequence doesn't feel split or duplicated.
    const restartStage: GameState = (raw === 'STAGE2_BAKER' ? 'STAGE2' : raw) as GameState;
    // Make restart resilient even if any audio/reset code throws.
    try { setIsPaused(false); } catch {}
    isPausedRef.current = false;
    try { setCurrentDialogue(null); } catch {}
    try { stopMusic(); } catch {}
    try {
      resetGame(restartStage as GameState);
    } catch (err) {
      // Ensure we still escape the game-over overlay.
      try { console.error('TryAgain failed, forcing stage:', err); } catch {}
      // Minimal safe reset so distance doesn't fast-forward into branch gates.
      try {
        distRef.current = 0;
        stageSegmentStartDistRef.current = 0;
        bgOffset.current = 0;
        obstaclesRef.current = [];
        powerUpsRef.current = [];
        particlesRef.current = [];
        setDistance(0);
        gsRef.current = restartStage as GameState;
        setGameState(restartStage as GameState);
      } catch {}
    }
  }, [resetGame, stopMusic]);

  const backToStart = useCallback(() => {
    // Make “Play Again” resilient on mobile/touch.
    try { setIsPaused(false); } catch {}
    isPausedRef.current = false;
    // Cancel any pending duel timers so they can't yank the state back.
    clearRpsTimeouts();
    clearCutsceneTimeouts();
    try { setStageTitle(null); } catch {}
    if (stageTitleTimeoutRef.current !== null) {
      try { window.clearTimeout(stageTitleTimeoutRef.current); } catch {}
      stageTitleTimeoutRef.current = null;
    }
    try { setCurrentDialogue(null); } catch {}
    try { stopMusic(); } catch {}
    // New run: allow stage title cards to show again.
    shownStageTitlesRef.current.clear();
    shownStageTitleTextsRef.current.clear();
    lastStageTitleTriggerRef.current = { stage: null, at: 0 };
    // Clear world state so a fresh run starts clean.
    obstaclesRef.current = [];
    powerUpsRef.current = [];
    particlesRef.current = [];
    bgOffset.current = 0;
    lastObstacleX.current = CW;
    lastPowerUpX.current = CW + 1500;
    distRef.current = 0;
    stageSegmentStartDistRef.current = 0;
    setDistance(0);
    gsRef.current = 'START';
    setGameState('START');
  }, [clearCutsceneTimeouts, clearRpsTimeouts, stopMusic]);

  useEffect(() => {
    return () => {
      if (stageTitleTimeoutRef.current !== null) {
        window.clearTimeout(stageTitleTimeoutRef.current);
        stageTitleTimeoutRef.current = null;
      }
    };
  }, []);

  const playDialogue = useCallback((d: Dialogue) => {
    setCurrentDialogue(d);
  }, []);

  // ─────────────────────────────────────────────
  // DRAW HELPERS
  // ─────────────────────────────────────────────

  const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) => {
    ctx.save();
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const ai = a + (2 * Math.PI) / 5;
      i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
              : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      ctx.lineTo(cx + r * 0.4 * Math.cos(ai), cy + r * 0.4 * Math.sin(ai));
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  };

  const drawMosque = (ctx: CanvasRenderingContext2D, x: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, GY - h, 70, h);
    ctx.beginPath(); ctx.arc(x + 35, GY - h, 35, Math.PI, 0); ctx.fill();
    ctx.fillRect(x + 60, GY - h - 80, 14, h + 80);
    ctx.beginPath(); ctx.arc(x + 67, GY - h - 80, 9, Math.PI, 0); ctx.fill();
    // Crescent
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(x + 67, GY - h - 94, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x + 70, GY - h - 97, 5.5, 0, Math.PI * 2); ctx.fill();
  };

  const drawHuman = (
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    isAmina: boolean,
    frame: number,
    stunned = false,
    torn = false
  ) => {
    ctx.save();
    ctx.translate(x, y);
    if (stunned) { ctx.rotate(Math.PI / 2.2); ctx.translate(0, -32); }

    const b  = stunned ? 0 : Math.abs(Math.sin(frame * Math.PI)) * 4;
    const ls = Math.sin(frame * Math.PI);
    const as = Math.sin(frame * Math.PI + Math.PI);
    const lean = stunned ? 0 : 0.14;

    // Back leg
    ctx.strokeStyle = isAmina ? '#270944' : '#1a3a0f';
    ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(24, 58 - b); ctx.lineTo(24 - ls * 22, 80 - b); ctx.stroke();

    // Robe body
    const robe = isAmina ? '#5e0099' : (torn ? '#4a5c2a' : '#2e7d32');
    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(18, 14 - b); ctx.lineTo(36, 14 - b);
    ctx.lineTo(49, 66 - b); ctx.lineTo(4, 66 - b); ctx.closePath(); ctx.fill();

    // Robe stripe / detail
    ctx.strokeStyle = isAmina ? '#ce93d8' : '#a5d6a7';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(27, 18 - b); ctx.lineTo(27, 60 - b); ctx.stroke();

    // Belt
    ctx.fillStyle = isAmina ? '#ffc107' : '#e53935';
    ctx.fillRect(8, 36 - b, 36, 8);
    ctx.fillStyle = isAmina ? '#fff' : '#fff9c4';
    ctx.beginPath(); ctx.arc(26, 40 - b, 3, 0, Math.PI * 2); ctx.fill();

    if (torn) {
      ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, 38 - b); ctx.lineTo(22, 52 - b);
      ctx.moveTo(33, 28 - b); ctx.lineTo(39, 46 - b); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      [14, 32, 20].forEach(dx => { ctx.beginPath(); ctx.arc(dx, 52 - b - dx * 0.2, 4, 0, Math.PI * 2); ctx.fill(); });
    }

    // Front leg
    ctx.strokeStyle = isAmina ? '#270944' : '#1a3a0f';
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(24, 58 - b); ctx.lineTo(24 + ls * 22, 80 - b); ctx.stroke();

    // Back arm
    ctx.strokeStyle = isAmina ? '#7b1fa2' : '#388e3c';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(26, 25 - b); ctx.lineTo(10 + as * -14, 48 - b); ctx.stroke();

    // Head (face)
    ctx.fillStyle = '#f5cba7';
    ctx.beginPath(); ctx.arc(28 + lean * 8, 3 - b, 14, 0, Math.PI * 2); ctx.fill();

    // Eyes
    const ex = lean * 8;
    ctx.fillStyle = '#2c1810';
    ctx.beginPath();
    ctx.arc(32 + ex, 0 - b, 2.5, 0, Math.PI * 2);
    ctx.arc(38 + ex, 0 - b, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(32 + ex, 0 - b, 1.3, 0, Math.PI * 2);
    ctx.arc(38 + ex, 0 - b, 1.3, 0, Math.PI * 2); ctx.fill();

    if (isAmina) {
      // Glowing evil eyes
      ctx.fillStyle = '#ce93d8';
      ctx.beginPath(); ctx.arc(32 + ex, 0 - b, 1, 0, Math.PI * 2);
      ctx.arc(38 + ex, 0 - b, 1, 0, Math.PI * 2); ctx.fill();
      // Black veil over lower face
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(19 + ex, 8 - b, 22, 14);
      // Dark headscarf
      ctx.fillStyle = '#0d0d0d';
      ctx.beginPath(); ctx.ellipse(28 + ex, -4 - b, 17, 12, 0, 0, Math.PI * 2); ctx.fill();
      // Veil drape
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(14 + ex, -1 - b);
      ctx.quadraticCurveTo(7 + ex, 22 - b, 11 + ex, 52 - b);
      ctx.lineTo(18 + ex, 52 - b);
      ctx.quadraticCurveTo(16 + ex, 22 - b, 20 + ex, -1 - b);
      ctx.fill();
      // Purple glow aura (evil)
      const aura = ctx.createRadialGradient(28 + ex, 3 - b, 0, 28 + ex, 3 - b, 22);
      aura.addColorStop(0, 'rgba(123,31,162,0.25)');
      aura.addColorStop(1, 'transparent');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(28 + ex, 3 - b, 22, 0, Math.PI * 2); ctx.fill();
    } else {
      // Beard
      ctx.fillStyle = '#5d4037';
      ctx.beginPath();
      ctx.moveTo(23 + ex, 10 - b); ctx.lineTo(43 + ex, 10 - b);
      ctx.lineTo(35 + ex, 22 - b); ctx.fill();
      // Mustache
      ctx.fillStyle = '#4e342e';
      ctx.beginPath(); ctx.ellipse(35 + ex, 6 - b, 7, 3, 0, 0, Math.PI); ctx.fill();
      // Turban
      ctx.fillStyle = '#fffde7';
      ctx.beginPath(); ctx.ellipse(28 + ex, -4 - b, 17, 11, 0, 0, Math.PI * 2); ctx.fill();
      // Turban gold band
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(28 + ex, 4 - b, 17, 5, 0, Math.PI, 0); ctx.stroke();
      // Turban tail (white scarf trailing)
      ctx.strokeStyle = '#fffde7'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(13 + ex, -1 - b);
      ctx.quadraticCurveTo(-4 + ex, 16 - b, -10 + ex, 44 - b); ctx.stroke();
    }

    // Front arm
    ctx.strokeStyle = isAmina ? '#7b1fa2' : '#388e3c';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(26, 25 - b); ctx.lineTo(40 + as * 14, 48 - b); ctx.stroke();

    ctx.restore();
  };

  const drawDog = (ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, shield: boolean) => {
    ctx.save();
    ctx.translate(x, y);
    const b = Math.abs(Math.sin(frame * Math.PI)) * 3;
    const ls = Math.sin(frame * Math.PI) * 10;

    // Body
    ctx.fillStyle = '#a1887f';
    ctx.beginPath(); ctx.roundRect(0, 8 + b, 58, 28, 12); ctx.fill();
    ctx.fillStyle = '#8d6e63';
    ctx.beginPath(); ctx.roundRect(4, 12 + b, 50, 12, 6); ctx.fill();

    // Head
    ctx.fillStyle = '#a1887f';
    ctx.beginPath(); ctx.roundRect(38, -3 + b, 28, 26, 8); ctx.fill();
    // Snout
    ctx.fillStyle = '#bcaaa4';
    ctx.beginPath(); ctx.roundRect(56, 9 + b, 14, 12, 5); ctx.fill();
    ctx.fillStyle = '#4e342e';
    ctx.beginPath(); ctx.arc(64, 11 + b, 3, 0, Math.PI * 2); ctx.fill();

    // Eye
    ctx.fillStyle = '#2c1810';
    ctx.beginPath(); ctx.arc(50, 3 + b, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(51, 2 + b, 1.8, 0, Math.PI * 2); ctx.fill();

    // Ears
    ctx.fillStyle = '#795548';
    ctx.beginPath(); ctx.ellipse(44, -1 + b, 7, 14, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(56, -3 + b, 6, 11, -0.2, 0, Math.PI * 2); ctx.fill();

    // Legs
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(5, 30 + b, 11, 16 - ls);
    ctx.fillRect(18, 30 + b, 11, 16 + ls);
    ctx.fillRect(39, 30 + b, 11, 16 + ls);
    ctx.fillRect(52, 30 + b, 11, 16 - ls);
    // Paws
    ctx.fillStyle = '#6d4c41';
    [[4, 42 + b - ls], [17, 42 + b + ls], [38, 42 + b + ls], [51, 42 + b - ls]].forEach(([px, py]) => {
      ctx.beginPath(); ctx.roundRect(px, py, 14, 7, 3); ctx.fill();
    });

    // Collar
    ctx.fillStyle = '#c62828';
    ctx.fillRect(38, 20 + b, 22, 7);
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(49, 27 + b, 3.5, 0, Math.PI * 2); ctx.fill();

    // Tail
    ctx.strokeStyle = '#a1887f'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2, 20 + b);
    ctx.quadraticCurveTo(-22, 6 + b + Math.sin(frame * 2) * 10, -12, -8 + b);
    ctx.stroke();

    if (shield) {
      ctx.strokeStyle = 'rgba(33,150,243,0.6)'; ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.beginPath(); ctx.arc(34, 20 + b, 58, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  };

  const drawMule = (ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, tint: 'GOLD' | 'DARK' = 'GOLD') => {
    ctx.save();
    ctx.translate(x, y);
    const b = Math.sin(frame * 0.04) * 3;
    const col = tint === 'GOLD' ? '#7a4a1a' : '#3b2a1e';
    const hi  = tint === 'GOLD' ? '#b57f2b' : '#6b4a2e';
    // Body
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(-60, 10 + b, 120, 56, 18); ctx.fill();
    // Belly highlight
    ctx.fillStyle = hi;
    ctx.beginPath(); ctx.roundRect(-48, 26 + b, 96, 20, 10); ctx.fill();
    // Neck
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(35, 16 + b);
    ctx.lineTo(72, -6 + b);
    ctx.lineTo(86, 2 + b);
    ctx.lineTo(54, 28 + b);
    ctx.closePath();
    ctx.fill();
    // Head
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(78, -18 + b, 44, 34, 10); ctx.fill();
    // Ears
    ctx.fillStyle = '#1a0f0a';
    ctx.beginPath(); ctx.roundRect(86, -44 + b, 10, 30, 5); ctx.fill();
    ctx.beginPath(); ctx.roundRect(104, -46 + b, 10, 32, 5); ctx.fill();
    // Snout
    ctx.fillStyle = hi;
    ctx.beginPath(); ctx.roundRect(110, -10 + b, 18, 18, 7); ctx.fill();
    ctx.fillStyle = '#1a0f0a';
    ctx.beginPath(); ctx.arc(123, -1 + b, 3, 0, Math.PI * 2); ctx.fill();
    // Legs
    ctx.fillStyle = col;
    [-40, -10, 20, 45].forEach((lx, i) => {
      const wob = Math.sin(frame * 0.02 + i) * 3;
      ctx.fillRect(lx, 58 + b, 16, 40 + wob);
      ctx.fillStyle = '#1a0f0a';
      ctx.fillRect(lx - 1, 92 + b + wob, 18, 8);
      ctx.fillStyle = col;
    });
    // Tail
    ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-62, 32 + b); ctx.quadraticCurveTo(-94, 16 + b, -90, -8 + b); ctx.stroke();
    ctx.fillStyle = '#1a0f0a';
    ctx.beginPath(); ctx.arc(-90, -10 + b, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // Wise woman — distinct from Sidi: blue robe, white hair, staff, hunched stance
  const drawWoman = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.save();
    ctx.translate(x, y);
    const b = 0;
    // Staff
    ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(52, -10 - b); ctx.lineTo(58, 80 - b); ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(52, -16 - b, 6, 0, Math.PI * 2); ctx.fill();
    // Back leg
    ctx.strokeStyle = '#1a2a4a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(22, 58 - b); ctx.lineTo(18, 80 - b); ctx.stroke();
    // Robe — deep blue
    ctx.fillStyle = '#1a3a7a';
    ctx.beginPath();
    ctx.moveTo(14, 16 - b); ctx.lineTo(32, 16 - b);
    ctx.lineTo(44, 66 - b); ctx.lineTo(2, 66 - b); ctx.closePath(); ctx.fill();
    // Silver sash
    ctx.fillStyle = '#c0c0d8';
    ctx.fillRect(6, 36 - b, 32, 7);
    ctx.fillStyle = '#e8e8ff';
    ctx.beginPath(); ctx.arc(22, 39 - b, 3, 0, Math.PI * 2); ctx.fill();
    // Robe detail — silver pattern
    ctx.strokeStyle = '#9090c8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(23, 20 - b); ctx.lineTo(23, 58 - b); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(10 + i * 5, 30 + i * 6 - b); ctx.lineTo(36 - i * 2, 30 + i * 6 - b); ctx.stroke();
    }
    // Front leg
    ctx.strokeStyle = '#1a2a4a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(22, 58 - b); ctx.lineTo(26, 80 - b); ctx.stroke();
    // Arm extended toward player
    ctx.strokeStyle = '#2a4a8a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(22, 28 - b); ctx.lineTo(-2, 46 - b); ctx.stroke();
    // Head — older, lighter skin
    ctx.fillStyle = '#e8c9a0';
    ctx.beginPath(); ctx.arc(24, 4 - b, 13, 0, Math.PI * 2); ctx.fill();
    // White hair / headscarf
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath(); ctx.ellipse(24, -2 - b, 15, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.moveTo(12, 2 - b); ctx.quadraticCurveTo(6, 22 - b, 10, 50 - b);
    ctx.lineTo(16, 50 - b); ctx.quadraticCurveTo(14, 22 - b, 18, 2 - b);
    ctx.fill();
    // Eyes — wise, slightly narrowed
    ctx.fillStyle = '#3c2a10';
    ctx.beginPath(); ctx.arc(28, 3 - b, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(34, 3 - b, 2, 0, Math.PI * 2); ctx.fill();
    // Eyebrows — arched, white
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(28, 0 - b, 4, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(34, 0 - b, 4, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    // Aura glow — cyan magic
    const wg = ctx.createRadialGradient(22, 4 - b, 0, 22, 4 - b, 20);
    wg.addColorStop(0, 'rgba(0,200,220,0.18)'); wg.addColorStop(1, 'transparent');
    ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(22, 4 - b, 20, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, state: GameState, offset: number, time: number) => {
    const t = time;

    // ── GRAVEYARD ──────────────────────────────
    if (state === 'INTRO_GRAVE') {
      const sky = ctx.createLinearGradient(0, 0, 0, CH);
      sky.addColorStop(0, '#000005'); sky.addColorStop(0.7, '#0a0020'); sky.addColorStop(1, '#1a0030');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, CH);

      // Twinkling stars
      starsRef.current.forEach(s => {
        const tw = 0.5 + 0.5 * Math.sin(t * 0.002 + s.phase);
        ctx.fillStyle = `rgba(255,255,220,${tw * 0.9})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size * tw, 0, Math.PI * 2); ctx.fill();
      });

      // Moon glow
      const mg = ctx.createRadialGradient(680, 55, 0, 680, 55, 55);
      mg.addColorStop(0, 'rgba(255,253,220,1)'); mg.addColorStop(0.6, 'rgba(255,253,180,0.7)'); mg.addColorStop(1, 'rgba(255,253,100,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(680, 55, 55, 0, Math.PI * 2); ctx.fill();

      // Far mosque silhouettes
      ctx.fillStyle = '#06001c';
      for (let i = 0; i < 4; i++) drawMosque(ctx, ((i * 280 - offset * 0.04) % 1120 + 1120) % 1120 - 70, 180, '#06001c');

      // Graves
      ctx.fillStyle = '#18082a';
      for (let i = 0; i < 18; i++) {
        const gx = ((i * 105 - offset * 0.7) % 1890 + 1890) % 1890;
        const gh = 38 + (i % 3) * 14;
        ctx.fillRect(gx, GY - gh, 30, gh);
        ctx.beginPath(); ctx.arc(gx + 15, GY - gh, 15, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = '#2a0c40'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gx + 15, GY - gh - 8); ctx.lineTo(gx + 15, GY - gh + 18);
        ctx.moveTo(gx + 5, GY - gh + 4); ctx.lineTo(gx + 25, GY - gh + 4); ctx.stroke();
      }

      // Ground
      ctx.fillStyle = '#12071e'; ctx.fillRect(0, GY, CW, CH - GY);
      // Fog
      const fog = ctx.createLinearGradient(0, GY - 60, 0, GY + 20);
      fog.addColorStop(0, 'transparent'); fog.addColorStop(1, 'rgba(40,0,80,0.45)');
      ctx.fillStyle = fog; ctx.fillRect(0, GY - 60, CW, 80);
    }

    // ── DESERT (STAGE 1) ────────────────────────
    else if (state === 'STAGE1' || state === 'CHOICE_1') {
      const sky = ctx.createLinearGradient(0, 0, 0, CH);
      sky.addColorStop(0, '#1a0a4e'); sky.addColorStop(0.25, '#8b1a1a');
      sky.addColorStop(0.6, '#dd5500'); sky.addColorStop(1, '#ff8c00');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, CH);

      // Sun glow
      const sg = ctx.createRadialGradient(640, 110, 0, 640, 110, 90);
      sg.addColorStop(0, 'rgba(255,255,210,1)'); sg.addColorStop(0.35, 'rgba(255,180,0,0.75)'); sg.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(640, 110, 90, 0, Math.PI * 2); ctx.fill();

      // Stars (dusk)
      starsRef.current.slice(0, 35).forEach(s => {
        ctx.fillStyle = `rgba(255,255,220,0.35)`;
        ctx.beginPath(); ctx.arc(s.x, s.y * 0.45, s.size * 0.8, 0, Math.PI * 2); ctx.fill();
      });

      // Far dunes
      ctx.fillStyle = '#b94810';
      for (let i = 0; i < 5; i++) {
        const dx = ((i * 680 - offset * 0.045) % 3400 + 3400) % 3400;
        ctx.beginPath(); ctx.moveTo(dx, GY); ctx.quadraticCurveTo(dx + 340, GY - 165, dx + 680, GY); ctx.fill();
      }

      // Mid-dunes
      ctx.fillStyle = '#c87040';
      for (let i = 0; i < 6; i++) {
        const dx = ((i * 500 - offset * 0.09) % 3000 + 3000) % 3000;
        ctx.beginPath(); ctx.moveTo(dx, GY); ctx.quadraticCurveTo(dx + 250, GY - 110, dx + 500, GY); ctx.fill();
      }

      // Mosque silhouettes mid
      ctx.fillStyle = '#7a3100';
      for (let i = 0; i < 5; i++) {
        const mx = ((i * 400 - offset * 0.18) % 2000 + 2000) % 2000;
        drawMosque(ctx, mx, 160, '#7a3100');
      }

      // Market stalls
      for (let i = 0; i < 8; i++) {
        const sx = ((i * 370 - offset * 0.38) % 2960 + 2960) % 2960;
        ctx.fillStyle = '#5d3010'; ctx.fillRect(sx, GY - 130, 130, 130);
        // Arch top
        ctx.fillStyle = '#7a4020';
        ctx.beginPath(); ctx.arc(sx + 65, GY - 130, 50, Math.PI, 0); ctx.fill();
        // Striped awning
        const awcs = ['#c0392b', '#fff', '#f39c12', '#c0392b', '#fff'];
        for (let j = 0; j < 5; j++) {
          ctx.fillStyle = awcs[j % awcs.length]; ctx.fillRect(sx - 8 + j * 28, GY - 148, 28, 20);
        }
        // Hanging lantern
        ctx.fillStyle = '#ffd700';
        ctx.beginPath(); ctx.arc(sx + 65, GY - 162, 9, 0, Math.PI * 2); ctx.fill();
        const lg = ctx.createRadialGradient(sx + 65, GY - 162, 0, sx + 65, GY - 162, 22);
        lg.addColorStop(0, 'rgba(255,200,0,0.45)'); lg.addColorStop(1, 'transparent');
        ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(sx + 65, GY - 162, 22, 0, Math.PI * 2); ctx.fill();
        // Items on stall
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(sx + 25, GY - 38, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#27ae60'; ctx.beginPath(); ctx.arc(sx + 58, GY - 35, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f39c12'; ctx.beginPath(); ctx.arc(sx + 90, GY - 32, 15, 0, Math.PI * 2); ctx.fill();
      }

      // Sand particles
      for (let i = 0; i < 8; i++) {
        const px = ((i * 190 + offset * 0.55 + Math.sin(t * 0.001 + i) * 25) % CW + CW) % CW;
        ctx.fillStyle = `rgba(210,150,80,${0.15 + (i % 3) * 0.08})`;
        ctx.beginPath(); ctx.arc(px, GY - 15 - (i * 12 % 55), 2 + i % 3, 0, Math.PI * 2); ctx.fill();
      }

      // Ground
      const sg2 = ctx.createLinearGradient(0, GY, 0, CH);
      sg2.addColorStop(0, '#c8a46e'); sg2.addColorStop(0.4, '#b8904a'); sg2.addColorStop(1, '#8b6914');
      ctx.fillStyle = sg2; ctx.fillRect(0, GY, CW, CH - GY);
      ctx.strokeStyle = 'rgba(180,140,60,0.4)'; ctx.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        const lx = ((i * 95 - offset * 0.65) % 855 + 855) % 855;
        ctx.beginPath(); ctx.moveTo(lx, GY + 5); ctx.quadraticCurveTo(lx + 47, GY + 9, lx + 95, GY + 5); ctx.stroke();
      }
    }

    // ── DARK CITY (STAGE 2) ─────────────────────
    else if (state === 'STAGE2' || state === 'STAGE2_BAKER' || state === 'STAGE_ALLEY' || state === 'TRANSFORM_DOG_SEQ' || state === 'CHOICE_2') {
      const sky = ctx.createLinearGradient(0, 0, 0, CH);
      sky.addColorStop(0, '#000008'); sky.addColorStop(0.5, '#060030'); sky.addColorStop(1, '#0d0040');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, CH);

      starsRef.current.forEach(s => {
        const tw = 0.6 + 0.4 * Math.sin(t * 0.003 + s.phase);
        ctx.fillStyle = `rgba(255,255,230,${tw})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
      });

      // Full moon
      const mg2 = ctx.createRadialGradient(130, 80, 0, 130, 80, 75);
      mg2.addColorStop(0, 'rgba(255,255,220,1)'); mg2.addColorStop(0.5, 'rgba(255,255,180,0.6)'); mg2.addColorStop(1, 'rgba(200,200,100,0)');
      ctx.fillStyle = mg2; ctx.beginPath(); ctx.arc(130, 80, 75, 0, Math.PI * 2); ctx.fill();

      // Far building silhouettes
      ctx.fillStyle = '#04001a';
      for (let i = 0; i < 10; i++) {
        const bx = ((i * 240 - offset * 0.07) % 2400 + 2400) % 2400;
        const bh = 150 + (i * 47) % 120;
        ctx.fillRect(bx, GY - bh, 130, bh);
        ctx.beginPath(); ctx.arc(bx + 65, GY - bh, 45, Math.PI, 0); ctx.fill();
      }

      // Mid buildings with lit windows
      for (let i = 0; i < 14; i++) {
        const bx = ((i * 185 - offset * 0.28) % 2590 + 2590) % 2590;
        const bh = 175 + (i * 37) % 100;
        ctx.fillStyle = '#0d0535'; ctx.fillRect(bx, GY - bh, 110, bh);
        for (let wy = 0; wy < 3; wy++) {
          for (let wx = 0; wx < 2; wx++) {
            const wX = bx + 14 + wx * 50, wY = GY - bh + 18 + wy * 50;
            const lit = (i + wy + wx) % 3 !== 0;
            if (lit) {
              ctx.fillStyle = 'rgba(255,200,80,0.5)'; ctx.fillRect(wX, wY, 28, 32);
              const wg = ctx.createRadialGradient(wX + 14, wY + 16, 0, wX + 14, wY + 16, 24);
              wg.addColorStop(0, 'rgba(255,200,80,0.2)'); wg.addColorStop(1, 'transparent');
              ctx.fillStyle = wg; ctx.fillRect(wX - 10, wY - 10, 48, 52);
            } else {
              ctx.fillStyle = 'rgba(25,12,55,0.6)'; ctx.fillRect(wX, wY, 28, 32);
            }
          }
        }
        // Arch door
        ctx.fillStyle = '#000'; ctx.fillRect(bx + 40, GY - 58, 28, 58);
        ctx.beginPath(); ctx.arc(bx + 54, GY - 58, 14, Math.PI, 0); ctx.fill();
      }

      // Ground with moon reflection
      const gg = ctx.createLinearGradient(0, GY, 0, CH);
      gg.addColorStop(0, '#18093a'); gg.addColorStop(1, '#0d0820');
      ctx.fillStyle = gg; ctx.fillRect(0, GY, CW, CH - GY);
      const mr = ctx.createRadialGradient(130, GY + 20, 0, 130, GY + 20, 320);
      mr.addColorStop(0, 'rgba(200,200,100,0.08)'); mr.addColorStop(1, 'transparent');
      ctx.fillStyle = mr; ctx.fillRect(0, GY, CW, CH - GY);
      // Cobblestones
      ctx.strokeStyle = 'rgba(80,50,120,0.45)'; ctx.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const lx = ((i * 54 - offset * 0.78) % 972 + 972) % 972;
        ctx.strokeRect(lx, GY + 2, 54, 32); ctx.strokeRect(lx + 27, GY + 34, 54, 32);
      }
    }

    // ── PALACE (STAGE 3) ────────────────────────
    else if (state === 'STAGE3' || state === 'STAGE_COURT' || state === 'SULTAN_SEQ' || state === 'DOG_HOME_SEQ' || state === 'TRANSFORM_HORSE_SEQ') {
      const sky = ctx.createLinearGradient(0, 0, 0, CH);
      sky.addColorStop(0, '#0d0035'); sky.addColorStop(0.4, '#1a0060');
      sky.addColorStop(0.7, '#4a007a'); sky.addColorStop(1, '#7a0050');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, CH);

      starsRef.current.forEach(s => {
        ctx.fillStyle = 'rgba(255,255,220,0.5)';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size * 0.85, 0, Math.PI * 2); ctx.fill();
      });

      // Crescent moon
      ctx.fillStyle = '#fffde7'; ctx.beginPath(); ctx.arc(650, 70, 33, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0d0035'; ctx.beginPath(); ctx.arc(666, 62, 28, 0, Math.PI * 2); ctx.fill();
      drawStar(ctx, 695, 48, 8, '#ffd700');

      // Palace complex far
      ctx.fillStyle = '#1e0045';
      for (let i = 0; i < 4; i++) {
        const px = ((i * 480 - offset * 0.055) % 1920 + 1920) % 1920;
        ctx.fillRect(px + 100, GY - 155, 200, 155);
        ctx.beginPath(); ctx.arc(px + 200, GY - 155, 155, Math.PI, 0); ctx.fill();
        ctx.fillRect(px + 196, GY - 225, 8, 70);
        ctx.beginPath(); ctx.moveTo(px + 200, GY - 245); ctx.lineTo(px + 193, GY - 225); ctx.lineTo(px + 207, GY - 225); ctx.fill();
        ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(px + 200, GY - 248, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1e0045'; ctx.beginPath(); ctx.arc(px + 204, GY - 252, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1e0045';
      }

      // Palace walls mid
      for (let i = 0; i < 8; i++) {
        const wx = ((i * 310 - offset * 0.19) % 2480 + 2480) % 2480;
        ctx.fillStyle = '#2a0058'; ctx.fillRect(wx, GY - 185, 195, 185);
        ctx.fillStyle = '#380075';
        ctx.beginPath(); ctx.arc(wx + 97, GY - 185, 68, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(wx + 97, GY - 185, 66, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = 'rgba(200,100,255,0.35)';
        ctx.fillRect(wx + 28, GY - 135, 38, 48); ctx.fillRect(wx + 128, GY - 135, 38, 48);
        const mg3 = ctx.createRadialGradient(wx + 47, GY - 111, 0, wx + 47, GY - 111, 28);
        mg3.addColorStop(0, 'rgba(200,100,255,0.2)'); mg3.addColorStop(1, 'transparent');
        ctx.fillStyle = mg3; ctx.beginPath(); ctx.arc(wx + 47, GY - 111, 28, 0, Math.PI * 2); ctx.fill();
      }

      // Ground — ornate tiles
      const tg = ctx.createLinearGradient(0, GY, 0, CH);
      tg.addColorStop(0, '#1a003e'); tg.addColorStop(1, '#0d0028');
      ctx.fillStyle = tg; ctx.fillRect(0, GY, CW, CH - GY);
      ctx.strokeStyle = 'rgba(100,50,150,0.4)'; ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const tx = ((i * 68 - offset * 0.88) % 952 + 952) % 952;
        ctx.strokeRect(tx, GY + 2, 68, 38); ctx.strokeRect(tx + 34, GY + 40, 68, 38);
      }
      ctx.fillStyle = 'rgba(255,215,0,0.08)';
      for (let i = 0; i < 5; i++) {
        const tx = (((i * 195 + 48) - offset * 0.88) % 975 + 975) % 975;
        ctx.fillRect(tx, GY + 2, 68, 36);
      }
    }
  };

  const drawObstacle = (ctx: CanvasRenderingContext2D, obs: Obstacle, sx: number, time: number) => {
    ctx.save();
    ctx.translate(sx, obs.y);
    switch (obs.type) {
      case 'BASKET': case 'WALL': // intentional fallthrough for wall too
      case 'STALL': {
        if (obs.type === 'BASKET') {
          const bg = ctx.createLinearGradient(0, 0, obs.width, 0);
          bg.addColorStop(0, '#8d6e4a'); bg.addColorStop(0.5, '#c8a46e'); bg.addColorStop(1, '#7a5c38');
          ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, obs.width, obs.height, 5); ctx.fill();
          ctx.strokeStyle = '#5c3d1e'; ctx.lineWidth = 1.5;
          for (let i = 0; i < obs.height; i += 8) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(obs.width, i); ctx.stroke(); }
          for (let i = 0; i < obs.width; i += 11) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, obs.height); ctx.stroke(); }
          ctx.fillStyle = '#b8925a'; ctx.beginPath(); ctx.roundRect(-5, -9, obs.width + 10, 12, 4); ctx.fill();
          ctx.strokeStyle = '#5c3d1e'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
          ctx.beginPath(); ctx.arc(obs.width, 0, 10, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
        } else if (obs.type === 'STALL') {
          ctx.fillStyle = '#5d3010'; ctx.fillRect(0, 0, obs.width, obs.height);
          ctx.fillStyle = '#c0392b'; ctx.fillRect(-8, -13, obs.width + 16, 17);
          ctx.fillStyle = '#fff';
          for (let i = 0; i < 3; i++) ctx.fillRect(-8 + i * 30, -13, 14, 17);
        } else { // WALL
          const wg = ctx.createLinearGradient(0, 0, obs.width, 0);
          wg.addColorStop(0, '#4a3728'); wg.addColorStop(0.5, '#6d4c3c'); wg.addColorStop(1, '#3e2d1e');
          ctx.fillStyle = wg; ctx.fillRect(0, 0, obs.width, obs.height);
          ctx.strokeStyle = '#2c1e12'; ctx.lineWidth = 1.5;
          for (let r = 0; r < obs.height; r += 22) {
            const off2 = (Math.floor(r / 22) % 2) * (obs.width / 2);
            ctx.strokeRect(off2, r, obs.width / 2, 22); ctx.strokeRect(obs.width / 2 + off2, r, obs.width / 2, 22);
          }
          ctx.fillStyle = '#4a3728';
          for (let i = 0; i < 3; i++) ctx.fillRect(i * (obs.width / 3) + 2, -13, obs.width / 3 - 4, 15);
        }
        break;
      }
      case 'POT': {
        const pg = ctx.createLinearGradient(0, 0, obs.width, 0);
        pg.addColorStop(0, '#8b3000'); pg.addColorStop(0.45, '#c0510a'); pg.addColorStop(1, '#7a2800');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.moveTo(obs.width * 0.3, obs.height);
        ctx.bezierCurveTo(-obs.width * 0.15, obs.height * 0.6, -obs.width * 0.1, 0, obs.width / 2, 0);
        ctx.bezierCurveTo(obs.width * 1.1, 0, obs.width * 1.15, obs.height * 0.6, obs.width * 0.7, obs.height);
        ctx.fill();
        ctx.fillStyle = '#7a2800'; ctx.beginPath(); ctx.ellipse(obs.width / 2, 0, obs.width * 0.44, obs.height * 0.09, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(obs.width / 2, obs.height * 0.42, obs.width * 0.43, obs.height * 0.07, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#8b3000'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(-3, obs.height * 0.3, 10, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
        break;
      }
      case 'CAMEL': {
        ctx.fillStyle = '#d4b483';
        // Body
        ctx.beginPath(); ctx.roundRect(0, obs.height * 0.35, obs.width * 0.82, obs.height * 0.48, 14); ctx.fill();
        // Hump
        ctx.beginPath(); ctx.arc(obs.width * 0.38, obs.height * 0.25, obs.width * 0.24, Math.PI, 0); ctx.fill();
        // Neck
        ctx.fillStyle = '#c8a46e';
        ctx.beginPath();
        ctx.moveTo(obs.width * 0.72, obs.height * 0.36);
        ctx.lineTo(obs.width * 0.84, obs.height * 0.12);
        ctx.lineTo(obs.width * 0.95, obs.height * 0.12);
        ctx.lineTo(obs.width * 0.86, obs.height * 0.44); ctx.fill();
        // Head
        ctx.fillStyle = '#c8a46e'; ctx.beginPath(); ctx.roundRect(obs.width * 0.84, obs.height * 0.06, obs.width * 0.16, obs.height * 0.28, 6); ctx.fill();
        // Eye
        ctx.fillStyle = '#2c1810'; ctx.beginPath(); ctx.arc(obs.width * 0.97, obs.height * 0.16, 3, 0, Math.PI * 2); ctx.fill();
        // Legs
        ctx.fillStyle = '#b89860';
        [0.08, 0.26, 0.46, 0.62].forEach(lx => ctx.fillRect(obs.width * lx, obs.height * 0.8, obs.width * 0.09, obs.height * 0.2));
        // Saddle
        ctx.fillStyle = '#c0392b'; ctx.fillRect(obs.width * 0.28, obs.height * 0.27, obs.width * 0.22, obs.height * 0.14);
        // Fringe
        ctx.fillStyle = '#ffd700';
        for (let i = 0; i < 5; i++) { ctx.fillRect(obs.width * (0.28 + i * 0.044), obs.height * 0.41, 5, 10); }
        break;
      }
      case 'BALCONY': {
        ctx.fillStyle = '#5d3010'; ctx.fillRect(0, 0, obs.width, obs.height);
        ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, obs.width, obs.height);
        ctx.strokeStyle = '#c8860a'; ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          const bx2 = i * (obs.width / 6) + 10;
          ctx.beginPath(); ctx.moveTo(bx2, 0); ctx.lineTo(bx2, -24); ctx.stroke();
          ctx.beginPath(); ctx.arc(bx2, -24, 5, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(obs.width, -24); ctx.stroke();
        break;
      }
      case 'SPRINGBOARD': {
        ctx.fillStyle = '#8b0000'; ctx.fillRect(0, 0, obs.width, obs.height);
        ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3; ctx.strokeRect(3, 3, obs.width - 6, obs.height - 6);
        ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(6 + i * 12, 0); ctx.lineTo(10 + i * 12, obs.height); ctx.stroke(); }
        ctx.fillStyle = '#ffd700'; ctx.font = 'bold 13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('↑', obs.width / 2, obs.height / 2 + 1);
        break;
      }
      case 'LAMP': {
        const sw = Math.sin(time * 0.002) * 6;
        ctx.translate(sw, 0);
        ctx.strokeStyle = '#8b7355'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(obs.width / 2, -35); ctx.lineTo(obs.width / 2, 0); ctx.stroke();
        const lg2 = ctx.createRadialGradient(obs.width / 2, obs.height / 2, 0, obs.width / 2, obs.height / 2, obs.width / 2);
        lg2.addColorStop(0, '#ff8c00'); lg2.addColorStop(0.6, '#cc6000'); lg2.addColorStop(1, '#8b4400');
        ctx.fillStyle = lg2; ctx.beginPath(); ctx.arc(obs.width / 2, obs.height / 2, obs.width / 2, 0, Math.PI * 2); ctx.fill();
        const glow2 = ctx.createRadialGradient(obs.width / 2, obs.height / 2, 0, obs.width / 2, obs.height / 2, obs.width * 1.1);
        glow2.addColorStop(0, 'rgba(255,160,0,0.35)'); glow2.addColorStop(1, 'transparent');
        ctx.fillStyle = glow2; ctx.beginPath(); ctx.arc(obs.width / 2, obs.height / 2, obs.width * 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(obs.width / 2, obs.height / 2, obs.width / 2, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'CARPET': {
        ctx.fillStyle = '#6a0080'; ctx.fillRect(0, 0, obs.width, obs.height);
        ctx.fillStyle = '#ab47bc';
        for (let i = 0; i < 4; i++) ctx.fillRect(i * 22 + 4, 3, 10, obs.height - 6);
        ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5; ctx.strokeRect(0, 0, obs.width, obs.height);
        ctx.fillStyle = '#ffd700';
        for (let i = 0; i <= 9; i++) {
          ctx.fillRect(i * (obs.width / 9), obs.height, 3, 8);
          ctx.fillRect(i * (obs.width / 9), 0, 3, -8);
        }
        break;
      }
      case 'GUARD': {
        // Body
        ctx.fillStyle = '#8b2500'; ctx.fillRect(8, 18, 28, 42);
        // Armor breastplate
        ctx.fillStyle = '#5c5c7a'; ctx.beginPath(); ctx.roundRect(9, 18, 26, 32, 3); ctx.fill();
        // Helmet
        ctx.fillStyle = '#5c5c7a'; ctx.beginPath(); ctx.arc(22, 10, 15, Math.PI, 0); ctx.fill();
        ctx.fillRect(8, 10, 28, 10);
        ctx.fillStyle = '#888'; ctx.fillRect(17, 8, 10, 3);
        // Spear
        ctx.strokeStyle = '#9e8866'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(39, -22); ctx.lineTo(39, 78); ctx.stroke();
        ctx.fillStyle = '#c0c0c0';
        ctx.beginPath(); ctx.moveTo(39, -33); ctx.lineTo(34, -22); ctx.lineTo(44, -22); ctx.fill();
        // Shield
        ctx.fillStyle = '#8b0000'; ctx.beginPath(); ctx.roundRect(-4, 22, 19, 26, 3); ctx.fill();
        ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(5, 35, 5, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
    ctx.restore();
  };

  // ─────────────────────────────────────────────
  // MAIN GAME LOOP (single stable RAF callback)
  // ─────────────────────────────────────────────

  const loopRef = useRef<(time: number) => void>(() => {});

  useEffect(() => {
    loopRef.current = (time: number) => {
      const gs = gsRef.current;
      const canvas = canvasRef.current;
      if (!canvas) { requestRef.current = requestAnimationFrame(loopRef.current); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { requestRef.current = requestAnimationFrame(loopRef.current); return; }

      const player = playerRef.current;
      const enemy  = enemyRef.current;

      // ── PAUSE ──────────────────────────────────
      if (isPausedRef.current) {
        requestRef.current = requestAnimationFrame(loopRef.current);
        return;
      }

      // ── PASSIVE STATES (just draw) ──────────────
      const passiveStates: GameState[] = ['START', 'CHOICE_1', 'CHOICE_2', 'RPS_BATTLE', 'ENDING_VICTORY', 'ENDING_BAKER', 'ENDING_DEFEAT', 'CAUGHT', 'CAUGHT_STAGE3'];
      if (passiveStates.includes(gs)) {
        // Draw animated background for menus
        const bgState: GameState = gs === 'CAUGHT' ? lastStage.current : (gs === 'RPS_BATTLE' ? 'STAGE3' : gs);
        ctx.save();
        drawBackground(
          ctx,
          bgState === 'ENDING_BAKER'
            ? 'STAGE2'
            : (bgState === 'ENDING_VICTORY' || bgState === 'ENDING_DEFEAT')
              ? 'STAGE3'
              : bgState,
          bgOffset.current,
          time
        );

        // RPS battle face-off vignette (keeps the climax visually alive)
        if (gs === 'RPS_BATTLE') {
          const pulse = 0.5 + 0.5 * Math.sin(time * 0.005);
          const vign = ctx.createRadialGradient(CW / 2, CH / 2, 120, CW / 2, CH / 2, 480);
          vign.addColorStop(0, `rgba(0,0,0,${0.20 + pulse * 0.08})`);
          vign.addColorStop(1, 'rgba(0,0,0,0.78)');
          ctx.fillStyle = vign; ctx.fillRect(0, 0, CW, CH);

          const sidiX = 250;
          const aminaX = 540;
          const bob = Math.sin(time * 0.01) * 2;
          drawHuman(ctx, sidiX, GY - 80 + bob, false, time * 0.01, false, true);
          drawHuman(ctx, aminaX, GY - 90 - bob, true, time * 0.01, false);

          // Magical clash line
          ctx.strokeStyle = `rgba(255,215,0,${0.15 + pulse * 0.25})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(sidiX + 70, GY - 120);
          ctx.quadraticCurveTo(CW / 2, GY - 180 - pulse * 30, aminaX - 40, GY - 120);
          ctx.stroke();
          ctx.fillStyle = `rgba(180,0,255,${0.08 + pulse * 0.14})`;
          for (let i = 0; i < 10; i++) {
            const a = time * 0.01 + i;
            ctx.beginPath();
            ctx.arc(CW / 2 + Math.cos(a) * (40 + i * 8), GY - 155 + Math.sin(a * 1.2) * (18 + i * 3), 2 + (i % 3), 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.restore();
        // Advance bg slowly
        bgOffset.current += 2;
        requestRef.current = requestAnimationFrame(loopRef.current);
        return;
      }

      // ── CUTSCENE STATES ──────────────────────────
      const isCutscene = gs === 'INTRO_GRAVE' || gs.includes('SEQ') || gs === 'SULTAN_SEQ';
      if (isCutscene) {
        // Draw background
        ctx.save();
        if (shakeRef.current > 0) ctx.translate((Math.random() - 0.5) * shakeRef.current, (Math.random() - 0.5) * shakeRef.current);
        drawBackground(ctx, gs, bgOffset.current, time);

        // Characters
        if (gs === 'INTRO_GRAVE') {
          if (cutsceneStep.current === 0) {
            player.x = -200; enemy.distance = 400;
            cutsceneStep.current = 1;
            setCurrentDialogue({ text: 'Amina? By Allah — you feast with a ghoul upon the dead!', speaker: 'SIDI' });
          } else if (cutsceneStep.current === 1) {
            if (player.x < 200) { player.x += 1.8; player.frame = (player.frame + 0.12) % 4; }
            else { cutsceneStep.current = 2; player.frame = 0; setTimeout(() => { setCurrentDialogue({ text: 'You dare spy on me, husband? Your curiosity seals your fate!', speaker: 'AMINA' }); cutsceneStep.current = 3; }, 2600); }
          } else if (cutsceneStep.current === 3) {
            cutsceneStep.current = 3.5;
            setTimeout(() => { setCurrentDialogue({ text: 'The graveyard reveals its terrible secret. Sidi must flee into Baghdad!', speaker: 'NARRATOR' }); cutsceneStep.current = 4; }, 3500);
          } else if (cutsceneStep.current === 4) {
            cutsceneStep.current = 4.5;
            setTimeout(() => { resetGame('STAGE1'); }, 2600);
          }
          // Draw Sidi walking in
          const aminaScreenX = 560;
          drawHuman(ctx, aminaScreenX, GY - 90, true, Date.now() * 0.008, false);
          drawHuman(ctx, player.x, GY - 80, false, player.frame, false);
          // Eerie glow at Amina
          if (cutsceneStep.current >= 1) {
            const gp = Math.sin(time * 0.005) * 18;
            const eg = ctx.createRadialGradient(aminaScreenX + 25, GY - 80, 0, aminaScreenX + 25, GY - 80, 55 + gp);
            eg.addColorStop(0, 'rgba(120,0,180,0.4)'); eg.addColorStop(1, 'transparent');
            ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(aminaScreenX + 25, GY - 80, 55 + gp, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#cf6';
            for (let i = 0; i < 6; i++) {
              ctx.beginPath();
              ctx.arc(aminaScreenX + 25 + Math.cos(time * 0.01 + i) * 35, GY - 80 + Math.sin(time * 0.01 + i) * 35, 2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        if (gs === 'TRANSFORM_DOG_SEQ') {
          if (cutsceneStep.current === 0) {
            setCurrentDialogue({ text: 'Creep! To punish your prying — become a DOG!', speaker: 'AMINA' });
            cutsceneStep.current = 1;
            playSFX('transform');
            setTimeout(() => { setCurrentDialogue({ text: 'With a flash of dark sorcery, Sidi\'s form twisted and shrank. Cast into the alleys.', speaker: 'NARRATOR' }); cutsceneStep.current = 2; }, 4000);
          } else if (cutsceneStep.current === 2) {
            cutsceneStep.current = 2.5;
            setTimeout(() => { resetGame('STAGE2'); }, 3500);
          }
          drawBackground(ctx, 'STAGE2', bgOffset.current, time);
          drawHuman(ctx, 260, GY - 80, true, Date.now() * 0.01, false);
          // Transform zap
          if (cutsceneStep.current === 1) {
            const zap = Math.sin(time * 0.05) * 45;
            ctx.fillStyle = `rgba(120,0,200,${0.4 + Math.sin(time * 0.05) * 0.2})`;
            ctx.beginPath(); ctx.arc(player.x + 25, player.y + 40, 55 + zap, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            for (let i = 0; i < 18; i++) {
              ctx.beginPath(); ctx.arc(player.x + 25 + Math.cos(i) * (30 + zap), player.y + 40 + Math.sin(i) * (30 + zap), 5, 0, Math.PI * 2); ctx.fill();
            }
            drawHuman(ctx, player.x, player.y, false, player.frame, false);
          } else {
            drawDog(ctx, player.x, GY - 46, player.frame, false);
          }
        }

        if (gs === 'SULTAN_SEQ') {
          // Sidi reaches the Sultan's court — the Sultan's wise woman gives him the vial
          if (cutsceneStep.current === 0) {
            setCurrentDialogue({ text: 'My Sultan! My wife Amina is a ghoul — she feasts on the dead and works dark sorcery!', speaker: 'SIDI' });
            cutsceneStep.current = 1;
            setTimeout(() => { setCurrentDialogue({ text: 'A woman steps from the shadows of the court: "I know her name and her curse. Take this vial, brave one."', speaker: 'NARRATOR' }); cutsceneStep.current = 2; }, 4200);
          } else if (cutsceneStep.current === 2) {
            cutsceneStep.current = 2.5;
            setTimeout(() => { setCurrentDialogue({ text: '"Throw it in her face and speak her name. She will be bound — no more to harm the living."', speaker: 'WOMAN' }); cutsceneStep.current = 3; }, 3800);
          } else if (cutsceneStep.current === 3) {
            cutsceneStep.current = 3.5;
            setTimeout(() => { resetGame('STAGE3'); }, 2800);
          }
          drawBackground(ctx, 'STAGE3', bgOffset.current, time);
          // Throne room pillars
          ctx.fillStyle = '#1e0045';
          [80, 220, 560, 700].forEach(px => { ctx.fillRect(px, GY - 280, 28, 280); ctx.beginPath(); ctx.arc(px + 14, GY - 280, 18, Math.PI, 0); ctx.fill(); });
          drawHuman(ctx, 220, GY - 80, false, player.frame * 0.2, false, true); // Sidi (torn clothes)
          drawWoman(ctx, 490, GY - 80); // wise woman at court
          // Golden vial glow
          const vp = Math.sin(time * 0.05) * 22;
          const vg = ctx.createRadialGradient(370, GY - 55, 0, 370, GY - 55, 42 + vp);
          vg.addColorStop(0, 'rgba(255,200,0,0.55)'); vg.addColorStop(1, 'transparent');
          ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(370, GY - 55, 42 + vp, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffd700'; ctx.fillRect(362, GY - 72, 16, 30);
        }

        if (gs === 'DOG_HOME_SEQ') {
          if (cutsceneStep.current === 0) {
            setCurrentDialogue({ text: 'A kind woman recognized my human soul within this beast...', speaker: 'SIDI' });
            cutsceneStep.current = 1;
            playSFX('powerup');
            setTimeout(() => { setCurrentDialogue({ text: '"If you were born a man — let this water restore you!" The spell broke.', speaker: 'NARRATOR' }); cutsceneStep.current = 2; }, 5000);
          } else if (cutsceneStep.current === 2) {
            cutsceneStep.current = 2.5;
            setTimeout(() => { setCurrentDialogue({ text: '"Take this vial, Sidi. When Amina arrives, throw it at her face."', speaker: 'WOMAN' }); cutsceneStep.current = 3; }, 4000);
          } else if (cutsceneStep.current === 3) {
            cutsceneStep.current = 3.5;
            setTimeout(() => { setCurrentDialogue({ text: 'Restored! Clothes torn, spirit unbroken — Sidi now hunts the hunter.', speaker: 'NARRATOR' }); cutsceneStep.current = 4; }, 3500);
          } else if (cutsceneStep.current === 4) {
            cutsceneStep.current = 4.5;
            setTimeout(() => { resetGame('STAGE3'); }, 2500);
          }
          drawBackground(ctx, 'STAGE3', bgOffset.current, time);
          // Interior house
          ctx.fillStyle = '#4e342e'; ctx.fillRect(90, GY - 310, 620, 310);
          ctx.fillStyle = '#1a0a00'; ctx.fillRect(350, GY - 125, 100, 125);
          ctx.beginPath(); ctx.arc(400, GY - 125, 50, Math.PI, 0); ctx.fill();
          // Kind woman (wise woman — distinct sprite)
          if (cutsceneStep.current >= 1) drawWoman(ctx, 490, GY - 80);
          // Transformation water
          if (cutsceneStep.current >= 2 && cutsceneStep.current < 3.5) {
            const wp = Math.sin(time * 0.04) * 35;
            ctx.fillStyle = 'rgba(0,212,255,0.45)';
            ctx.beginPath(); ctx.arc(player.x + 34, player.y + 23, 42 + wp, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            for (let i = 0; i < 14; i++) {
              ctx.beginPath(); ctx.arc(player.x + 34 + Math.cos(i) * (22 + wp), player.y + 23 + Math.sin(i) * (22 + wp), 4, 0, Math.PI * 2); ctx.fill();
            }
          }
          if (cutsceneStep.current >= 3) drawHuman(ctx, player.x, player.y, false, 0, false, true);
          else drawDog(ctx, player.x, GY - 46, player.frame, false);
        }

        if (gs === 'TRANSFORM_HORSE_SEQ') {
          if (cutsceneStep.current === 0) {
            setCurrentDialogue({ text: 'Be punished for your crimes, Amina — TRANSFORM!', speaker: 'SIDI' });
            cutsceneStep.current = 1;
            playSFX('transform');
            const t = window.setTimeout(() => {
              setCurrentDialogue({ text: 'The magic water struck Amina. With a blinding flash, she became a mule.', speaker: 'NARRATOR' });
              cutsceneStep.current = 2;
            }, 4200);
            cutsceneTimeoutsRef.current.push(t);
          } else if (cutsceneStep.current === 2) {
            cutsceneStep.current = 2.5;
            const t = window.setTimeout(() => { setGameState('ENDING_VICTORY'); setCurrentDialogue(null); }, 3200);
            cutsceneTimeoutsRef.current.push(t);
          }
          drawBackground(ctx, 'STAGE3', bgOffset.current, time);
          drawHuman(ctx, 200, GY - 80, false, 0, false, true);
          if (cutsceneStep.current === 1) {
            const zap2 = Math.sin(time * 0.05) * 50;
            ctx.fillStyle = 'rgba(255,215,0,0.4)';
            ctx.beginPath(); ctx.arc(550, GY - 80, 70 + zap2, 0, Math.PI * 2); ctx.fill();
            // Mule silhouette
            drawMule(ctx, 550, GY - 96, time, 'GOLD');
          } else {
            drawHuman(ctx, 520, GY - 90, true, 0, false);
          }
        }

        if (gs === 'RPS_LOSS_SEQ') {
          if (cutsceneStep.current === 0) {
            setCurrentDialogue({ text: 'You thought you had me? Then wager your fate — and lose!', speaker: 'AMINA' });
            cutsceneStep.current = 1;
            playSFX('transform');
            const t = window.setTimeout(() => {
              setCurrentDialogue({ text: 'Amina snatches the magic water. Dark words spill from her veil...', speaker: 'NARRATOR' });
              cutsceneStep.current = 2;
            }, 3200);
            cutsceneTimeoutsRef.current.push(t);
          } else if (cutsceneStep.current === 2) {
            cutsceneStep.current = 2.5;
            const t = window.setTimeout(() => {
              setCurrentDialogue({ text: '“Creep — become a mule!” The curse rebounds upon Sidi.', speaker: 'NARRATOR' });
              cutsceneStep.current = 3;
              playSFX('transform');
            }, 2600);
            cutsceneTimeoutsRef.current.push(t);
          } else if (cutsceneStep.current === 3.5) {
            cutsceneStep.current = 4;
            const t = window.setTimeout(() => { setGameState('ENDING_DEFEAT'); setCurrentDialogue(null); }, 2600);
            cutsceneTimeoutsRef.current.push(t);
          }

          drawBackground(ctx, 'STAGE3', bgOffset.current, time);
          const pulse = Math.sin(time * 0.05) * 30;

          // Amina (victorious) on the right
          drawHuman(ctx, 560, GY - 90, true, time * 0.01, false);
          // Sidi on the left, transforming
          if (cutsceneStep.current < 3) {
            drawHuman(ctx, 210, GY - 80, false, time * 0.01, false, true);
          } else if (cutsceneStep.current >= 3 && cutsceneStep.current < 3.5) {
            ctx.fillStyle = `rgba(120,0,200,${0.35 + 0.15 * Math.sin(time * 0.05)})`;
            ctx.beginPath(); ctx.arc(235, GY - 60, 62 + pulse, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            for (let i = 0; i < 16; i++) {
              ctx.beginPath();
              ctx.arc(235 + Math.cos(i) * (30 + pulse), GY - 60 + Math.sin(i) * (30 + pulse), 4, 0, Math.PI * 2);
              ctx.fill();
            }
            drawHuman(ctx, 210, GY - 80, false, 0, false, true);
          } else {
            drawMule(ctx, 235, GY - 102, time, 'DARK');
          }

          // Amina escape streak
          if (cutsceneStep.current >= 2) {
            ctx.strokeStyle = 'rgba(255,215,0,0.35)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(560, GY - 120);
            ctx.quadraticCurveTo(700, GY - 200, 830, GY - 250);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,215,0,0.2)';
            ctx.beginPath(); ctx.arc(560, GY - 120, 40 + Math.sin(time * 0.04) * 10, 0, Math.PI * 2); ctx.fill();
          }

          if (cutsceneStep.current >= 3 && cutsceneStep.current < 3.5) {
            // advance to the “after” state once the flash has peaked
            cutsceneStep.current = 3.5;
          }
        }

        // Particles
        particlesRef.current.forEach(p => {
          ctx.save();
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x - bgOffset.current, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });

        ctx.restore();
        requestRef.current = requestAnimationFrame(loopRef.current);
        return;
      }

      // ── ACTIVE GAMEPLAY ──────────────────────────

      // Timers
      if (player.stunTimer > 0) { player.stunTimer -= 16; if (player.stunTimer <= 0) setIsStunned(false); }
      if (player.shieldTimer > 0) { player.shieldTimer -= 16; if (player.shieldTimer <= 0) setHasShield(false); }
      if (player.speedTimer > 0) { player.speedTimer -= 16; if (player.speedTimer <= 0) setSpeedBoost(1); }
      if (shakeRef.current > 0) setScreenShake(s => Math.max(0, s - 1.2));

      // Speeds
      const curSpeed = speedRef.current;
      const pSpeed = player.stunTimer > 0 ? 0 : BASE_SPEED * curSpeed;
      // Amina speed: keep consistent across all chase stages.
      // This prevents “unavoidable” catch-up when the player runs clean.
      let aSpeed = CHASER_SPEED; // Amina/Guards base chase speed

      // Stage I — Old Quarter balance:
      // The displayed distance climbs very quickly, so any big speed jump at
      // 1500 can feel instantaneous. NOTE: the HUD shows Math.floor(distance / 10),
      // so 1500m on-screen == 15000 internal units.
      // Start slightly less oppressive than the default chaser speed, then
      // ramp up gradually after 1500 (HUD meters).
      if (gs === 'STAGE_ALLEY') {
        aSpeed = BASE_SPEED + 0.25;
        const meters = distRef.current / 10;
        const t = Math.max(0, meters - 1500);
        const ramp = Math.min(1, t / 650);
        // Total add after 1500: 0.10 → 0.45 over time.
        aSpeed += 0.10 + ramp * 0.35;
      }
      if (gs === 'STAGE2' || gs === 'STAGE2_BAKER') {
        // Dog rounds: Amina should still be threatening, but not instantly fatal.
        // Keep her slightly faster than the player to create steady pressure.
        aSpeed = BASE_SPEED + 0.35;
      }
      if (gs === 'STAGE3') aSpeed = BASE_SPEED - 0.55; // Sidi chases Amina (she's slower)

      // Distance & scroll — use distRef as source of truth to avoid stale state after reset
      distRef.current += pSpeed;
      setDistance(distRef.current);
      bgOffset.current += pSpeed;

      // (Old Quarter speed-up handled above via gradual ramp.)

      // Enemy distance
      if (gs === 'STAGE3') enemy.distance += (aSpeed - pSpeed);
      else enemy.distance += (pSpeed - aSpeed);
      // Clamp to 0 so "caught" happens exactly when distance reaches 0.
      enemy.distance = Math.max(0, enemy.distance);

      // Player physics
      const targetX = player.stunTimer > 0 ? 145 : (curSpeed > 1 ? 340 : PLAYER_X);
      player.x += (targetX - player.x) * 0.12;
      player.vy += GRAVITY;
      player.y += player.vy;
      const wasJumping = player.isJumping;
      if (player.y >= GY - player.height) {
        player.y = GY - player.height;
        player.vy = 0;
        player.isJumping = false;
      }

      // Grounded tracking (for coyote time) and jump buffering.
      if (!player.isJumping) lastGroundedAtRef.current = time;
      if ((wasJumping && !player.isJumping) &&
          player.stunTimer <= 0 &&
          time - lastJumpPressedAtRef.current <= JUMP_BUFFER_MS) {
        lastJumpPressedAtRef.current = -Infinity;
        doJumpNow();
      }

      // Spawn obstacles
      const baseSpawnGap = gs === 'STAGE3' ? 270
        : gs === 'STAGE_COURT' ? 390
        : (gs === 'STAGE2' || gs === 'STAGE2_BAKER') ? 430
        : gs === 'STAGE_ALLEY' ? 420
        : 490;
      const diff = difficultyRef.current;
      // Difficulty controls obstacle density: higher difficulty => more obstacles.
      // Easy still has obstacles; it just spaces them a bit more.
      // NOTE: Hard increases obstacle *count* via multi-spawns; keep group spacing fair.
      const gapMult = diff === 'EASY' ? 1.05 : diff === 'MEDIUM' ? 0.92 : 0.92;
      const spawnGap = Math.max(diff === 'HARD' ? 260 : 220, baseSpawnGap * gapMult);
      if (lastObstacleX.current - bgOffset.current < CW) {
        const isDog = gs === 'STAGE2' || gs === 'STAGE2_BAKER';
        const types: ObstacleType[] = gs === 'STAGE1' ? ['BASKET', 'POT', 'STALL', 'CAMEL', 'BASKET']
          : gs === 'STAGE_ALLEY' ? ['WALL', 'BASKET', 'POT', 'LAMP', 'BASKET']
          : gs === 'STAGE_COURT' ? ['GUARD', 'WALL', 'BALCONY', 'SPRINGBOARD', 'GUARD', 'CARPET']
          : isDog ? ['WALL', 'BASKET', 'GUARD', 'LAMP', 'POT']
          : ['GUARD', 'POT', 'SPRINGBOARD', 'BALCONY', 'CARPET'];

        let furthestSpawnedX = -Infinity;
        const minBetweenObstacles = diff === 'HARD' ? 210 : diff === 'MEDIUM' ? 185 : 170;
        const pushObstacleSpaced = (o: Obstacle) => {
          const prev = obstaclesRef.current[obstaclesRef.current.length - 1];
          if (prev) o.x = Math.max(o.x, prev.x + minBetweenObstacles);
          obstaclesRef.current.push(o);
          furthestSpawnedX = Math.max(furthestSpawnedX, o.x);
        };

        if (gs === 'STAGE3' && Math.random() < 0.22) {
          const cx = bgOffset.current + CW + 90;
          pushObstacleSpaced({ x: cx, y: GY - 22, width: 62, height: 22, type: 'SPRINGBOARD' });
          pushObstacleSpaced({ x: cx - 38, y: GY - 205, width: 135, height: 20, type: 'BALCONY' });
        } else {
          let spawnCount = 1;
          const extraChance = diff === 'EASY' ? 0.10 : diff === 'MEDIUM' ? 0.25 : 0.0;
          if (Math.random() < extraChance) spawnCount = 2;
          if (diff === 'HARD') {
            spawnCount = 2;
            // Occasional third obstacle on non-court stages.
            if (gs !== 'STAGE_COURT' && gs !== 'STAGE3' && Math.random() < 0.12) spawnCount = 3;
          }

          const baseX = bgOffset.current + CW + 60 + Math.random() * 80;
          const groupGap = diff === 'HARD'
            ? (210 + Math.random() * 110)
            : diff === 'MEDIUM'
              ? (185 + Math.random() * 95)
              : (175 + Math.random() * 85);
          for (let i = 0; i < spawnCount; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            let w = 52 + Math.random() * 35, h = 48 + Math.random() * 38;
            if (type === 'WALL')  { w = 22; h = 135; }
            if (type === 'CAMEL') { w = 95; h = 78; }
            if (type === 'GUARD') { w = 48; h = 82; }
            if (type === 'LAMP')  { w = 38; h = 38; }
            const y = type === 'LAMP' ? GY - h - 40 : GY - h;
            const x = baseX + i * groupGap + Math.random() * 35;
            pushObstacleSpaced({
              x,
              y, width: w, height: h, type,
              vy: type === 'CARPET' ? (Math.random() - 0.5) * 1.8 : undefined,
            });
          }
        }
        // Use actual furthest placed obstacle so the next spawn can't happen too soon.
        const fallbackX = bgOffset.current + CW;
        lastObstacleX.current = (Number.isFinite(furthestSpawnedX) ? furthestSpawnedX : fallbackX) + spawnGap;
      }

      // Spawn power-ups
      if (lastPowerUpX.current - bgOffset.current < CW) {
        const diff = difficultyRef.current;
        const puPool: PowerUp['type'][] = ['SHIELD', 'SPEED'];
        // Slightly increase SPEED frequency without flooding the level.
        if (Math.random() < EXTRA_SPEED_POWERUP_CHANCE) puPool.push('SPEED');
        // On HARD, increase SHIELD frequency a bit (more obstacles => more shield value).
        if (diff === 'HARD' && Math.random() < EXTRA_SHIELD_POWERUP_CHANCE_HARD) puPool.push('SHIELD');
        if (gs === 'STAGE3') puPool.push('MAGIC');
        powerUpsRef.current.push({
          x: bgOffset.current + CW + 1100 + Math.random() * 900,
          y: GY - 115 - Math.random() * 95,
          type: puPool[Math.floor(Math.random() * puPool.length)],
          active: true,
        });
        lastPowerUpX.current = bgOffset.current + CW + 2100;
      }

      // Update particles
      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.025; return p.life > 0;
      });

      // Collisions — obstacles
      const curShield = shieldRef.current;
      obstaclesRef.current = obstaclesRef.current.filter(obs => {
        const ox = obs.x - bgOffset.current;
        // Carpet float
        if (obs.type === 'CARPET' && obs.vy !== undefined) {
          obs.y += obs.vy;
          if (obs.y < GY - 225 || obs.y > GY - 85) obs.vy *= -1;
        }
        // Platform types
        if (obs.type === 'BALCONY' || obs.type === 'CARPET') {
          if (player.x < ox + obs.width && player.x + player.width > ox &&
              player.vy >= 0 && player.y + player.height <= obs.y + 12 && player.y + player.height >= obs.y - 12) {
            player.y = obs.y - player.height; player.vy = 0; player.isJumping = false;
            // Landing on a platform counts as grounded for buffering/coyote time.
            lastGroundedAtRef.current = time;
            if (player.stunTimer <= 0 && time - lastJumpPressedAtRef.current <= JUMP_BUFFER_MS) {
              lastJumpPressedAtRef.current = -Infinity;
              doJumpNow();
            }
          }
          return ox > -obs.width;
        }
        // Springboard
        if (obs.type === 'SPRINGBOARD') {
          if (player.x < ox + obs.width && player.x + player.width > ox && player.y + player.height > obs.y && player.y < obs.y + obs.height) {
            player.vy = -23; player.isJumping = true;
            setScreenShake(5);
            playSFX('spring');
            spawnFX(player.x + 25, player.y + player.height, 8, '#ffd700');
          }
          return ox > -obs.width;
        }
        // Collision check
        const hit = player.x < ox + obs.width && player.x + player.width > ox &&
                    player.y + player.height > obs.y && player.y < obs.y + obs.height;
        // Lamp: tighter vertical
        const lampHit = obs.type === 'LAMP' && player.x + 10 < ox + obs.width && player.x + player.width - 10 > ox && player.y < obs.y + obs.height && player.y + 10 > obs.y;
        if (hit || lampHit) {
          if (curShield) {
            setHasShield(false); player.shieldTimer = 0;
            setScreenShake(5); playSFX('hit');
            spawnFX(player.x + 25, player.y + player.height / 2, 12, '#2196f3');
            return false;
          }
          player.stunTimer = 430; setIsStunned(true); setScreenShake(10); playSFX('hit');
          spawnFX(player.x + 25, player.y + player.height / 2, 15, '#ff8800');
          if (gs === 'STAGE3') enemy.distance += 130;
          else enemy.distance -= 130;
          return false;
        }
        return ox > -obs.width;
      });

      // Collisions — power-ups
      powerUpsRef.current = powerUpsRef.current.filter(pu => {
        const px2 = pu.x - bgOffset.current;
        if (pu.active && player.x < px2 + 40 && player.x + player.width > px2 && player.y < pu.y + 40 && player.y + player.height > pu.y) {
          if (pu.type === 'SHIELD') { setHasShield(true); player.shieldTimer = 5500; }
          else if (pu.type === 'SPEED') { setSpeedBoost(SPEED_BOOST_MULT); player.speedTimer = SPEED_BOOST_MS; }
          else { if (gs === 'STAGE3') enemy.distance -= 220; else enemy.distance += 220; }
          playSFX('powerup');
          spawnFX(px2 + 20, pu.y + 20, 18, pu.type === 'SHIELD' ? '#2196f3' : pu.type === 'SPEED' ? '#ffd700' : '#9c27b0');
          return false;
        }
        return px2 > -100;
      });

      // Animate player
      if (player.stunTimer <= 0) player.frame = (player.frame + 0.22) % 4;

      // Stage transitions (use distRef.current for freshest value)
      const d = distRef.current;
      const segD = d - stageSegmentStartDistRef.current;
      if (gs === 'STAGE1') {
        if (enemy.distance <= 0) { setGameState('TRANSFORM_DOG_SEQ'); cutsceneStep.current = 0; }
        else if (d >= 6500 && enemy.distance > 180) setGameState('CHOICE_1');
      } else if (gs === 'STAGE_ALLEY') {
        // Old quarter path: no fixed-distance ending.
        // You only get caught when Amina closes the distance to 0.
        if (enemy.distance <= 0) { setGameState('TRANSFORM_DOG_SEQ'); cutsceneStep.current = 0; }
      } else if (gs === 'STAGE_COURT') {
        if (enemy.distance <= 0) setGameState('CAUGHT');
        else if (d >= 7000) { stopMusic(); setGameState('SULTAN_SEQ'); cutsceneStep.current = 0; }
      } else if (gs === 'STAGE2') {
        if (enemy.distance <= 0) setGameState('CAUGHT');
        else if (d >= 7000 && gsRef.current === 'STAGE2') transitionStage('STAGE2_BAKER');
      } else if (gs === 'STAGE2_BAKER') {
        if (enemy.distance <= 0) setGameState('CAUGHT');
        else if (segD >= 5200) setGameState('CHOICE_2');
      } else if (gs === 'STAGE3') {
        if (enemy.distance <= 0) { enterRpsBattle(); }
        else if (enemy.distance > 950) setGameState('CAUGHT_STAGE3');
      }

      // ── DRAW FRAME ─────────────────────────────────
      ctx.save();
      if (shakeRef.current > 0) ctx.translate((Math.random() - 0.5) * shakeRef.current, (Math.random() - 0.5) * shakeRef.current);

      drawBackground(ctx, gs, bgOffset.current, time);

      // Obstacles
      obstaclesRef.current.forEach(obs => drawObstacle(ctx, obs, obs.x - bgOffset.current, time));

      // Power-ups
      powerUpsRef.current.forEach(pu => {
        if (!pu.active) return;
        const px2 = pu.x - bgOffset.current;
        ctx.save();
        ctx.translate(px2 + 20, pu.y + 20);
        const pulse = Math.sin(time * 0.008) * 5;
        const col = pu.type === 'SHIELD' ? '#2196f3' : pu.type === 'SPEED' ? '#ffd700' : '#9c27b0';
        const pg2 = ctx.createRadialGradient(0, 0, 0, 0, 0, 32 + pulse);
        pg2.addColorStop(0, col + 'aa'); pg2.addColorStop(1, 'transparent');
        ctx.fillStyle = pg2; ctx.beginPath(); ctx.arc(0, 0, 32 + pulse, 0, Math.PI * 2); ctx.fill();
        ctx.rotate(time * 0.005);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 15px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pu.type === 'SHIELD' ? '🛡' : pu.type === 'SPEED' ? '⚡' : '✨', 0, 0);
        ctx.restore();
      });

      // Player sprite
      const isDogGs = gs === 'STAGE2' || gs === 'STAGE2_BAKER';
      if (isDogGs) {
        drawDog(ctx, player.x, player.y, player.frame, shieldRef.current);
      } else {
        const torn = gs === 'STAGE3' || gs === 'STAGE_COURT';
        drawHuman(ctx, player.x, player.y, false, player.frame, player.stunTimer > 0, torn);
        if (shieldRef.current) {
          ctx.strokeStyle = 'rgba(33,150,243,0.7)'; ctx.lineWidth = 3; ctx.setLineDash([9, 5]);
          ctx.beginPath(); ctx.arc(player.x + 25, player.y + 40, 68, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // Amina / enemy
      const aminaScreenX = gs === 'STAGE3'
        ? player.x + enemy.distance
        : player.x - enemy.distance;
      drawHuman(ctx, aminaScreenX, GY - enemy.height, true, time * 0.01, false);

      // Particles
      particlesRef.current.forEach(p => {
        ctx.save(); ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x - bgOffset.current, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      // Scanlines retro overlay
      ctx.save(); ctx.globalAlpha = 0.04; ctx.fillStyle = '#000';
      for (let i = 0; i < CH; i += 4) ctx.fillRect(0, i, CW, 2);
      ctx.restore();

      ctx.restore();
      requestRef.current = requestAnimationFrame(loopRef.current);
    };
  });

  useEffect(() => {
    const loop = (time: number) => loopRef.current(time);
    requestRef.current = requestAnimationFrame(loop);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Enter' || e.code === 'Space') && (gsRef.current === 'ENDING_VICTORY' || gsRef.current === 'ENDING_DEFEAT' || gsRef.current === 'ENDING_BAKER')) {
        e.preventDefault();
        backToStart();
        return;
      }
      if (e.code === 'Enter' && gsRef.current === 'START') {
        e.preventDefault();
        resetGame('INTRO_GRAVE');
        return;
      }
      if ((e.code === 'Space' || e.code === 'Enter') && (gsRef.current === 'CAUGHT' || gsRef.current === 'CAUGHT_STAGE3')) {
        e.preventDefault();
        tryAgain();
        return;
      }
      if (gsRef.current === 'RPS_BATTLE') {
        if (e.code === 'KeyR' || e.code === 'Digit1') { e.preventDefault(); chooseRpsMove('ROCK'); }
        if (e.code === 'KeyP' || e.code === 'Digit2') { e.preventDefault(); chooseRpsMove('PAPER'); }
        if (e.code === 'KeyS' || e.code === 'Digit3') { e.preventDefault(); chooseRpsMove('SCISSORS'); }
        return;
      }
      if ((e.code === 'Space' || e.code === 'ArrowUp') && gsRef.current.startsWith('STAGE')) { e.preventDefault(); jump(); }
      if (e.code === 'KeyP' && gsRef.current.startsWith('STAGE')) {
        e.preventDefault();
        setIsPaused(p => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [backToStart, chooseRpsMove, jump, resetGame, tryAgain]);

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────

  const stageStartDist: Partial<Record<GameState, number>> = { STAGE1: 750, STAGE_ALLEY: 720, STAGE2: 560, STAGE2_BAKER: 440 };
  const proximityRef = stageStartDist[gameState] ?? INITIAL_DISTANCE;
  const proximityPct = Math.max(0, 100 - (enemyRef.current.distance / proximityRef) * 100);
  const stage3MaxDist = 950;
  const stage3Pct = gameState === 'STAGE3' ? Math.max(0, (1 - enemyRef.current.distance / stage3MaxDist) * 100) : 0;
  const courtPct   = gameState === 'STAGE_COURT' ? Math.max(0, 100 - (enemyRef.current.distance / 750) * 100) : 0;
  const displayPct = gameState === 'STAGE3' ? stage3Pct : gameState === 'STAGE_COURT' ? courtPct : proximityPct;
  const isCanvasInteractive = gameState.startsWith('STAGE');

  return (
    <div className="min-h-screen bg-[#05000f] flex items-center justify-center p-2 overflow-hidden"
         style={{ backgroundImage: 'radial-gradient(ellipse at 50% 50%, #0d0028 0%, #05000f 100%)' }}>
      <div className="relative w-full max-w-[800px] aspect-[16/9] shadow-[0_0_120px_rgba(120,0,200,0.25)] border border-amber-900/30">

        <canvas ref={canvasRef} width={CW} height={CH}
          onClick={isCanvasInteractive ? jump : undefined}
          className={`w-full h-full block ${isCanvasInteractive ? 'cursor-pointer pointer-events-auto' : 'cursor-default pointer-events-none'}`} />

        {/* ── STAGE TITLE CARD ── */}
        <AnimatePresence>
          {stageTitle && (
            <motion.div
              initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.5 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none z-50">
              <div className="border border-amber-600/60 px-10 py-5 bg-black/80 backdrop-blur-sm">
                <div className="text-amber-500 font-black text-xs uppercase tracking-[0.35em] mb-1">Arabian Nights</div>
                <div className="text-white font-black text-3xl italic tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>{stageTitle}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── HUD ── */}
        {gameState.startsWith('STAGE') && !stageTitle && (
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-30">
            <div>
              <div className="text-[10px] font-black text-amber-500/70 tracking-widest uppercase">Distance</div>
              <div className="text-2xl font-black text-amber-200 italic" style={{ fontFamily: 'Georgia, serif' }}>
                {Math.floor(distance / 10)}m
              </div>
              <div className="flex gap-2 mt-1">
                {hasShield && <Shield size={18} className="text-blue-400 animate-pulse" />}
                {speedBoost > 1 && <FastForward size={18} className="text-yellow-400 animate-bounce" />}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <div className="text-[10px] font-black text-red-400/80 tracking-widest uppercase">
                {gameState === 'STAGE3' ? 'Amina\'s Lead' : gameState === 'STAGE_COURT' ? 'Guards\' Pursuit' : 'Amina\'s Proximity'}
              </div>
              <div className="w-44 h-3 bg-black/50 border border-white/15 rounded-none overflow-hidden">
                <motion.div
                  className={`h-full ${gameState === 'STAGE3' ? 'bg-emerald-500' : 'bg-red-600'} transition-none`}
                  animate={{ width: `${displayPct}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
              {displayPct > 80 && (
                <div className="text-[10px] font-black text-red-400 animate-pulse tracking-wide">
                  {gameState === 'STAGE3' ? '⚡ CLOSING IN!' : '⚠ SHE\'S CLOSE!'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DIALOGUE BOX — only visible during cutscenes ── */}
        <AnimatePresence>
          {currentDialogue && (gameState === 'INTRO_GRAVE' || gameState.includes('SEQ') || gameState === 'SULTAN_SEQ') && (
            <motion.div
              key={currentDialogue.text}
              initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 w-[82%] bg-black/92 border border-amber-700/60 p-4 z-40"
              style={{ boxShadow: '0 0 30px rgba(180,120,0,0.2)' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-4 bg-amber-500" />
                <div className="text-amber-500 font-black text-[10px] uppercase tracking-[0.3em]">{currentDialogue.speaker}</div>
              </div>
              <div className="text-amber-50 text-sm italic leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
                {currentDialogue.text}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── STUN INDICATOR ── */}
        <AnimatePresence>
          {isStunned && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute top-1/2 left-1/3 -translate-y-1/2 pointer-events-none z-50">
              <div className="text-amber-400 font-black text-4xl italic animate-pulse drop-shadow-[0_0_15px_rgba(255,180,0,0.8)]"
                   style={{ fontFamily: 'Georgia, serif' }}>
                STUNNED!
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── START SCREEN ── */}
        <AnimatePresence>
          {gameState === 'START' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 overflow-hidden flex items-center justify-center">
              {/* Arabesque dot grid */}
              <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
                   style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #ffd700 1px, transparent 0)', backgroundSize: '32px 32px' }} />
              {/* Top & bottom ornamental bars */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-600 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-600 to-transparent" />

              {/* Corner lanterns */}
              {[['left-6 top-6', '6s'], ['right-6 top-6', '8s'], ['left-6 bottom-6', '7s'], ['right-6 bottom-6', '5s']].map(([pos, dur], i) => (
                <motion.div key={i} animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ repeat: Infinity, duration: parseFloat(dur), ease: 'easeInOut' }}
                  className={`absolute ${pos} w-3 h-5 bg-amber-500/30 blur-lg rounded-full`} />
              ))}

              {/* Difficulty (top-right) */}
              <div className="absolute top-6 right-6 z-20">
                <div className="mb-2 text-amber-600/70 font-black text-[10px] uppercase tracking-[0.4em] text-right">Difficulty</div>
                <div className="flex flex-col items-end gap-2">
                  {(['EASY', 'MEDIUM', 'HARD'] as const).map(d => {
                    const active = difficulty === d;
                    return (
                      <motion.button
                        key={d}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setDifficulty(d)}
                        className={
                          (active
                            ? 'bg-amber-700 text-amber-50 border-amber-500/40'
                            : 'bg-black/40 text-amber-200/70 border-amber-700/40 hover:bg-black/55')
                          + ' w-28 px-4 py-2 text-[11px] font-black tracking-widest border transition-colors'
                        }
                        style={{ clipPath: 'polygon(10% 0%, 100% 0%, 90% 100%, 0% 100%)', fontFamily: 'Georgia, serif' }}
                      >
                        {d}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div className="relative z-10 w-full max-w-lg px-6 sm:px-8 pt-6 sm:pt-8 pb-10 sm:pb-12 text-center">
                <div className="mb-2 text-amber-600/70 font-black text-[10px] uppercase tracking-[0.5em]">One Thousand and One Nights</div>

                <h1 className="text-[clamp(2rem,6vw,3.75rem)] font-black text-amber-400 italic tracking-tight mb-1 drop-shadow-[0_0_30px_rgba(255,180,0,0.4)]"
                    style={{ fontFamily: 'Georgia, serif' }}>
                  Extreme
                </h1>
                <h1 className="text-[clamp(2.5rem,7vw,4.5rem)] font-black text-amber-300 italic tracking-tight drop-shadow-[0_0_40px_rgba(255,180,0,0.5)]"
                    style={{ fontFamily: 'Georgia, serif' }}>
                  Sidi Run
                </h1>

                <div className="mt-2 mb-4 sm:mb-6 flex items-center justify-center gap-3">
                  <div className="h-px flex-1 max-w-[80px] bg-amber-700/50" />
                  <span className="text-amber-600 text-lg">✦</span>
                  <div className="h-px flex-1 max-w-[80px] bg-amber-700/50" />
                </div>

                <p className="max-w-xs mx-auto text-amber-100/60 text-xs italic leading-relaxed mb-3 sm:mb-5"
                   style={{ fontFamily: 'Georgia, serif' }}>
                  "A night of shadows, a sorceress's wrath, and a desperate race through the ancient streets of Baghdad..."
                </p>

                <motion.button
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { resetGame('INTRO_GRAVE'); }}
                  className="group relative flex items-center justify-center gap-3 mx-auto bg-amber-700 hover:bg-amber-600 px-7 sm:px-10 py-2.5 sm:py-3.5 text-base sm:text-lg font-black italic tracking-widest text-amber-50 border border-amber-500/30 shadow-[0_0_60px_rgba(180,100,0,0.3)] transition-all"
                  style={{ clipPath: 'polygon(8% 0%, 100% 0%, 92% 100%, 0% 100%)', fontFamily: 'Georgia, serif' }}>
                  <Play fill="currentColor" size={20} />
                  Enter the Tale
                </motion.button>

                <div className="mt-2 text-[10px] text-amber-700/50 tracking-widest">
                  SPACE / CLICK / TAP to jump
                </div>

                {/* Powerups legend (below CTA, no overlap) */}
                <div className="mt-5 sm:mt-6 flex justify-center gap-7 text-[10px] text-amber-600/60 uppercase tracking-widest">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-7 h-7 border border-amber-600/30 flex items-center justify-center text-amber-500"><Shield size={12}/></div>
                    Shield
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-7 h-7 border border-amber-600/30 flex items-center justify-center text-amber-500"><FastForward size={12}/></div>
                    Speed
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-7 h-7 border border-amber-600/30 flex items-center justify-center text-amber-500">✨</div>
                    Magic
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CHOICE 1 ── */}
        <AnimatePresence>
          {gameState === 'CHOICE_1' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/88 z-50 text-white p-8">
              <div className="border border-amber-700/50 p-8 max-w-sm text-center bg-black/70 backdrop-blur-sm">
                <div className="text-amber-400 font-black text-xs uppercase tracking-widest mb-2">— You Escaped —</div>
                <h2 className="text-2xl font-black italic text-amber-100 mb-3" style={{ fontFamily: 'Georgia, serif' }}>
                  What does Sidi do?
                </h2>
                <p className="italic text-amber-100/70 text-sm leading-relaxed mb-6" style={{ fontFamily: 'Georgia, serif' }}>
                  You have outrun Amina through Baghdad's winding alleys. She howls in the dark behind you. Two paths lie ahead...
                </p>
                <div className="flex flex-col gap-3">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { setCurrentDialogue(null); resetGame('STAGE_COURT'); }}
                    className="w-full py-3 border border-yellow-600 bg-yellow-950/60 text-yellow-300 font-black text-sm uppercase tracking-widest hover:bg-yellow-900/50 transition-all">
                    🏛 Race to the Sultan's palace
                    <div className="text-[10px] text-yellow-600/80 normal-case font-normal mt-0.5">Expose Amina — but the guards won't believe you yet</div>
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { setCurrentDialogue(null); resetGame('STAGE_ALLEY'); }}
                    className="w-full py-3 border border-red-800 bg-red-950/60 text-red-300 font-black text-sm uppercase tracking-widest hover:bg-red-900/50 transition-all">
                    🌑 Slip into the old quarter
                    <div className="text-[10px] text-red-600/80 normal-case font-normal mt-0.5">Run through dark alleys — more hazards, less mercy...</div>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CHOICE 2 ── */}
        <AnimatePresence>
          {gameState === 'CHOICE_2' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 z-50 text-white p-8">
              <div className="border border-amber-700/50 p-8 max-w-sm text-center bg-black/60 backdrop-blur-sm">
                <div className="text-amber-500 font-black text-xs uppercase tracking-widest mb-3">A Woman Beckons...</div>
                <p className="italic text-amber-100/80 text-sm leading-relaxed mb-6" style={{ fontFamily: 'Georgia, serif' }}>
                  A mysterious woman at the baker's shop sees through the enchantment. She motions for Sidi to follow. Does he trust her — or remain with the baker, making a quiet new life?
                </p>
                <div className="flex flex-col gap-3">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { stopMusic(); setGameState('DOG_HOME_SEQ'); cutsceneStep.current = 0; setCurrentDialogue(null); }}
                    className="w-full py-3 border border-cyan-700 bg-cyan-950/60 text-cyan-300 font-black text-sm uppercase tracking-widest hover:bg-cyan-900/60 transition-all">
                    ✨ Follow the woman
                    <div className="text-[10px] text-cyan-500/70 normal-case font-normal mt-0.5">Seek restoration and justice...</div>
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setBakerEndingIdx(Math.floor(Math.random() * BAKER_ENDINGS.length));
                      setGameState('ENDING_BAKER');
                      setCurrentDialogue(null);
                      stopMusic();
                    }}
                    className="w-full py-3 border border-amber-700 bg-amber-950/60 text-amber-300 font-black text-sm uppercase tracking-widest hover:bg-amber-900/60 transition-all">
                    🍞 Stay with the baker
                    <div className="text-[10px] text-amber-500/70 normal-case font-normal mt-0.5">A simpler, quieter fate...</div>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── FINAL DUEL: RPS BATTLE ── */}
        <AnimatePresence>
          {gameState === 'RPS_BATTLE' && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 text-white flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.98, y: 18, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.98, y: 18, opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="absolute inset-0 bg-black/65"
                style={{ backgroundImage: 'radial-gradient(ellipse at 50% 45%, rgba(255,215,0,0.10) 0%, rgba(120,0,200,0.10) 28%, rgba(0,0,0,0.92) 68%)' }}
              />

              <div className="relative w-[92%] max-w-xl border border-amber-700/40 bg-black/75 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-amber-500 font-black text-[10px] uppercase tracking-[0.45em]">Stage III — Final Duel</div>
                    <div className="text-amber-100 font-black text-2xl italic" style={{ fontFamily: 'Georgia, serif' }}>
                      Rock • Paper • Scissors
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-amber-600/70 uppercase tracking-widest">Controls</div>
                    <div className="text-[11px] text-amber-200/70 italic" style={{ fontFamily: 'Georgia, serif' }}>R / P / S (or 1 / 2 / 3)</div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 items-center gap-3">
                  <div className="border border-emerald-700/25 bg-emerald-950/25 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-emerald-200/70">Sidi</div>
                    <div className="text-lg font-black italic text-emerald-50" style={{ fontFamily: 'Georgia, serif' }}>
                      {playerRps ? (playerRps === 'ROCK' ? 'Rock' : playerRps === 'PAPER' ? 'Paper' : 'Scissors') : (rpsPhase === 'INTRO' ? 'Face-off…' : 'Choose!')}
                    </div>
                  </div>

                  <div className="text-center">
                    <motion.div
                      animate={{ scale: rpsPhase === 'CHOOSING' ? [1, 1.03, 1] : 1 }}
                      transition={{ repeat: rpsPhase === 'CHOOSING' ? Infinity : 0, duration: 1.2, ease: 'easeInOut' }}
                      className="text-amber-300 font-black italic text-2xl drop-shadow-[0_0_25px_rgba(255,215,0,0.35)]"
                      style={{ fontFamily: 'Georgia, serif' }}
                    >
                      VS
                    </motion.div>
                    <div className="mt-1 text-[11px] text-amber-100/60 italic" style={{ fontFamily: 'Georgia, serif' }}>
                      {rpsPhase === 'INTRO' ? 'The chase ends. The duel begins.' :
                       rpsPhase === 'CHOOSING' ? 'Make your move.' :
                       rpsPhase === 'REVEAL' ? 'Amina answers…' :
                       rpsOutcome === 'DRAW' ? 'Clash! Again!' :
                       rpsOutcome === 'WIN' ? 'You win the duel.' : 'You lose the duel.'}
                    </div>
                  </div>

                  <div className="border border-purple-700/25 bg-purple-950/25 p-3 text-right">
                    <div className="text-[10px] uppercase tracking-widest text-purple-200/70">Amina</div>
                    <div className="text-lg font-black italic text-purple-50" style={{ fontFamily: 'Georgia, serif' }}>
                      {aminaRps ? (aminaRps === 'ROCK' ? 'Rock' : aminaRps === 'PAPER' ? 'Paper' : 'Scissors') : (rpsPhase === 'RESULT' || rpsPhase === 'REVEAL' ? '…' : 'Waiting')}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  {([
                    { move: 'ROCK' as const, label: 'Rock', icon: '🪨', hint: 'Crushes Scissors' },
                    { move: 'PAPER' as const, label: 'Paper', icon: '📜', hint: 'Covers Rock' },
                    { move: 'SCISSORS' as const, label: 'Scissors', icon: '✂️', hint: 'Cuts Paper' },
                  ]).map(({ move, label, icon, hint }) => {
                    const disabled = rpsPhase !== 'CHOOSING';
                    const active = playerRps === move;
                    return (
                      <motion.button
                        key={move}
                        whileHover={disabled ? undefined : { scale: 1.03 }}
                        whileTap={disabled ? undefined : { scale: 0.97 }}
                        onClick={() => chooseRpsMove(move)}
                        disabled={disabled}
                        className={
                          (active
                            ? 'bg-amber-700/70 border-amber-400/40 text-amber-50'
                            : disabled
                              ? 'bg-black/30 border-white/10 text-amber-100/40'
                              : 'bg-black/45 border-amber-700/40 text-amber-100 hover:bg-black/60')
                          + ' border px-4 py-3 text-left transition-colors'
                        }
                        style={{ clipPath: 'polygon(8% 0%, 100% 0%, 92% 100%, 0% 100%)' }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-base font-black italic" style={{ fontFamily: 'Georgia, serif' }}>{label}</div>
                          <div className="text-2xl">{icon}</div>
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-amber-600/70 mt-1">{hint}</div>
                      </motion.button>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between text-[11px] text-amber-200/60 italic" style={{ fontFamily: 'Georgia, serif' }}>
                  <div>When Sidi catches Amina, fate is decided by a duel of hands.</div>
                  <div className={rpsOutcome === 'WIN' ? 'text-emerald-300/80' : rpsOutcome === 'LOSE' ? 'text-red-300/80' : 'text-amber-200/60'}>
                    {rpsOutcome ? (rpsOutcome === 'WIN' ? 'Honor reclaimed.' : rpsOutcome === 'LOSE' ? 'Curse reversed.' : 'No victor.') : ''}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CAUGHT ── */}
        <AnimatePresence>
          {(gameState === 'CAUGHT' || gameState === 'CAUGHT_STAGE3') && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/95 text-white z-50">
              <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #f87171 1px, transparent 0)', backgroundSize: '28px 28px' }} />
              <div className="text-8xl mb-4">💀</div>
              <h2 className="text-6xl font-black italic tracking-tight mb-3" style={{ fontFamily: 'Georgia, serif' }}>
                {gameState === 'CAUGHT_STAGE3' ? 'SHE ESCAPED!' : 'CAUGHT!'}
              </h2>
              <p className="text-lg text-red-200/80 italic mb-10 max-w-xs text-center" style={{ fontFamily: 'Georgia, serif' }}>
                {gameState === 'CAUGHT_STAGE3' ? 'Amina disappears into the night. Justice will have to wait...' : 'Amina\'s dark magic consumes you.'}
              </p>
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); tryAgain(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); tryAgain(); }}
                style={{ touchAction: 'manipulation' }}
                className="bg-white text-red-950 px-12 py-4 text-lg font-black uppercase tracking-widest hover:bg-gray-100 transition-all flex items-center gap-2">
                <RotateCcw size={18} /> Try Again
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── ENDING: BAKER ── */}
        <AnimatePresence>
          {gameState === 'ENDING_BAKER' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d0821] text-white p-10 z-50 text-center">
              <div className="text-6xl mb-3">🍞🐕💰</div>
              <h1 className="text-4xl font-black italic text-amber-400 mb-3" style={{ fontFamily: 'Georgia, serif' }}>
                {BAKER_ENDINGS[bakerEndingIdx]?.title ?? "The Fortune of the Baker's Dog"}
              </h1>
              <div className="max-w-md text-left space-y-3 mb-7" style={{ fontFamily: 'Georgia, serif' }}>
                {(BAKER_ENDINGS[bakerEndingIdx]?.body ?? BAKER_ENDINGS[0].body).map((node, i) => (
                  <p key={i} className={i === 3 ? 'text-amber-200/90 italic text-sm leading-relaxed' : 'text-amber-100/85 italic text-sm leading-relaxed'}>
                    {node}
                  </p>
                ))}
              </div>
              <motion.button whileHover={{ scale: 1.04 }}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); backToStart(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); backToStart(); }}
                style={{ touchAction: 'manipulation' }}
                className="bg-amber-700 hover:bg-amber-600 px-12 py-4 text-lg font-black uppercase tracking-widest transition-all">
                Play Again
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── ENDING: VICTORY ── */}
        <AnimatePresence>
          {gameState === 'ENDING_VICTORY' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-[#05001a] text-white p-10 z-50 text-center overflow-hidden">
              <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #ffd700 1px, transparent 0)', backgroundSize: '30px 30px' }} />
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 20, ease: 'linear' }}
                className="absolute inset-0 opacity-5 pointer-events-none border-[40px] border-amber-600/20 rounded-full" />
              <div className="text-7xl mb-3">🫏</div>
              <h1 className="text-7xl font-black italic text-amber-300 tracking-tight drop-shadow-[0_0_40px_rgba(255,215,0,0.5)]" style={{ fontFamily: 'Georgia, serif' }}>
                Victory!
              </h1>
              <div className="flex items-center gap-3 my-3">
                <div className="h-px w-16 bg-amber-700/50" />
                <span className="text-amber-500 text-xl">✦</span>
                <div className="h-px w-16 bg-amber-700/50" />
              </div>
              <p className="max-w-md text-amber-100/75 italic leading-relaxed text-sm mb-8" style={{ fontFamily: 'Georgia, serif' }}>
                Sidi Numan reclaimed his honor. Amina, the sorceress ghoul, was transformed into a mule — and the tale of Baghdad's most extraordinary husband entered the annals of the One Thousand and One Nights.
              </p>
              <motion.button whileHover={{ scale: 1.04 }}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); backToStart(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); backToStart(); }}
                className="bg-amber-600 hover:bg-amber-500 px-14 py-5 text-xl font-black uppercase italic tracking-widest transition-all border border-amber-400/30"
                style={{ fontFamily: 'Georgia, serif', touchAction: 'manipulation' }}>
                Play Again
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── ENDING: DEFEAT (RPS LOSS) ── */}
        <AnimatePresence>
          {gameState === 'ENDING_DEFEAT' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-[#120014] text-white p-10 z-50 text-center overflow-hidden">
              <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #c084fc 1px, transparent 0)', backgroundSize: '30px 30px' }} />
              <div className="text-7xl mb-3">🫏💧</div>
              <h1 className="text-6xl font-black italic text-red-200 tracking-tight drop-shadow-[0_0_40px_rgba(200,50,80,0.35)]" style={{ fontFamily: 'Georgia, serif' }}>
                Defeat.
              </h1>
              <div className="flex items-center gap-3 my-3">
                <div className="h-px w-16 bg-red-800/50" />
                <span className="text-red-300 text-xl">✦</span>
                <div className="h-px w-16 bg-red-800/50" />
              </div>
              <p className="max-w-md text-red-100/70 italic leading-relaxed text-sm mb-8" style={{ fontFamily: 'Georgia, serif' }}>
                Amina wins the duel. She steals the magic water and turns the curse back upon Sidi — leaving him a mule as she vanishes into Baghdad's night.
              </p>
              <motion.button whileHover={{ scale: 1.04 }}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); backToStart(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); backToStart(); }}
                className="bg-red-700 hover:bg-red-600 px-14 py-5 text-xl font-black uppercase italic tracking-widest transition-all border border-red-400/25"
                style={{ fontFamily: 'Georgia, serif', touchAction: 'manipulation' }}>
                Play Again
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── PAUSE OVERLAY ── */}
        <AnimatePresence>
          {isPaused && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-40 pointer-events-none">
              <div className="text-amber-400 font-black text-5xl italic tracking-widest" style={{ fontFamily: 'Georgia, serif' }}>
                PAUSED
              </div>
              <div className="text-amber-700/60 text-xs uppercase tracking-widest mt-2">Press P or tap ⏸ to resume</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CONTROL BUTTONS ── */}
        <div className="absolute bottom-4 right-4 flex gap-2 z-50">
          {gameState.startsWith('STAGE') && (
            <button
              onClick={() => setIsPaused(p => !p)}
              className="bg-black/50 border border-amber-900/30 p-2.5 text-amber-400 hover:bg-amber-900/30 transition-all">
              {isPaused ? <Play size={18} /> : <span className="text-[18px] leading-none font-black">⏸</span>}
            </button>
          )}
          <button
            onClick={() => {
              setIsMuted(m => {
                const next = !m;
                isMutedRef.current = next;
                if (next) stopMusic();
                else startMusic(savedMusicKey.current);
                return next;
              });
            }}
            className="bg-black/50 border border-amber-900/30 p-2.5 text-amber-400 hover:bg-amber-900/30 transition-all">
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
