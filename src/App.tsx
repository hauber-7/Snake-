/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  RotateCcw, 
  Play, 
  Pause, 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight,
  Volume2,
  VolumeX,
  Zap
} from 'lucide-react';

// --- Constants ---
const GRID_SIZE = 20;
const INITIAL_SNAKE = [
  { x: 10, y: 10 },
  { x: 10, y: 11 },
  { x: 10, y: 12 },
];
const INITIAL_DIRECTION = { x: 0, y: -1 };
const MIN_TICK_RATE = 60;

const DIFFICULTIES = {
  EASY: { label: 'Easy', initialTickRate: 200, speedIncrement: 1, color: 'text-emerald-400', glow: 'shadow-emerald-500/40' },
  MEDIUM: { label: 'Medium', initialTickRate: 150, speedIncrement: 1.5, color: 'text-cyan-400', glow: 'shadow-cyan-500/40' },
  HARD: { label: 'Hard', initialTickRate: 100, speedIncrement: 2.5, color: 'text-rose-400', glow: 'shadow-rose-500/40' },
};

type DifficultyKey = keyof typeof DIFFICULTIES;
type Point = { x: number; y: number };
type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export default function App() {
  // Game State
  const [gameState, setGameState] = useState<GameState>('START');
  const [difficulty, setDifficulty] = useState<DifficultyKey>('MEDIUM');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  
  // Refs for high-performance loop (avoiding React state for the core loop)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeRef = useRef<Point[]>([...INITIAL_SNAKE]);
  const directionRef = useRef<Point>(INITIAL_DIRECTION);
  const nextDirectionRef = useRef<Point>(INITIAL_DIRECTION);
  const foodRef = useRef<Point>({ x: 5, y: 5 });
  const tickRateRef = useRef(DIFFICULTIES.MEDIUM.initialTickRate);
  const lastTickTimeRef = useRef(0);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef(0);

  // --- Sound Effects ---
  const playSound = useCallback((type: 'eat' | 'die') => {
    if (isMuted) return;
    
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      if (type === 'eat') {
        // High-pitched "blip"
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        oscillator.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.1); // C6
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
      } else if (type === 'die') {
        // Low-pitched "thud/descending"
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(110, audioCtx.currentTime); // A2
        oscillator.frequency.exponentialRampToValueAtTime(27.5, audioCtx.currentTime + 0.5); // A0
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
      }

      // Close context after sound finishes to free resources
      setTimeout(() => {
        if (audioCtx.state !== 'closed') {
          audioCtx.close();
        }
      }, 600);
    } catch (e) {
      console.error('Audio error:', e);
    }
  }, [isMuted]);

  // --- Helper Functions ---
  const getRandomPoint = (): Point => ({
    x: Math.floor(Math.random() * GRID_SIZE),
    y: Math.floor(Math.random() * GRID_SIZE),
  });

  const generateFood = () => {
    let newFood = getRandomPoint();
    while (snakeRef.current.some(s => s.x === newFood.x && s.y === newFood.y)) {
      newFood = getRandomPoint();
    }
    foodRef.current = newFood;
  };

  const resetGame = () => {
    snakeRef.current = [...INITIAL_SNAKE];
    directionRef.current = INITIAL_DIRECTION;
    nextDirectionRef.current = INITIAL_DIRECTION;
    tickRateRef.current = DIFFICULTIES[difficulty].initialTickRate;
    scoreRef.current = 0;
    setScore(0);
    setGameState('PLAYING');
    generateFood();
    lastTickTimeRef.current = performance.now();
  };

  const gameOver = () => {
    setGameState('GAME_OVER');
    playSound('die');
    if (scoreRef.current > highScore) {
      setHighScore(scoreRef.current);
      localStorage.setItem('snakeHighScore', scoreRef.current.toString());
    }
  };

  // --- Core Game Loop ---
  const update = (time: number) => {
    if (gameState !== 'PLAYING') return;

    const deltaTime = time - lastTickTimeRef.current;

    if (deltaTime >= tickRateRef.current) {
      // Logic Tick
      lastTickTimeRef.current = time;
      directionRef.current = nextDirectionRef.current;

      const head = snakeRef.current[0];
      const newHead = {
        x: head.x + directionRef.current.x,
        y: head.y + directionRef.current.y,
      };

      // Wall collision
      if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
        gameOver();
        return;
      }

      // Self collision
      if (snakeRef.current.some(s => s.x === newHead.x && s.y === newHead.y)) {
        gameOver();
        return;
      }

      const newSnake = [newHead, ...snakeRef.current];

      // Food collision
      if (newHead.x === foodRef.current.x && newHead.y === foodRef.current.y) {
        scoreRef.current += 10;
        setScore(scoreRef.current);
        tickRateRef.current = Math.max(MIN_TICK_RATE, tickRateRef.current - DIFFICULTIES[difficulty].speedIncrement);
        generateFood();
        playSound('eat');
      } else {
        newSnake.pop();
      }

      snakeRef.current = newSnake;
    }

    draw(time);
    requestRef.current = requestAnimationFrame(update);
  };

  const draw = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = canvas.width / GRID_SIZE;
    const progress = (time - lastTickTimeRef.current) / tickRateRef.current;
    const clampedProgress = Math.min(1, Math.max(0, progress));

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid (Subtle)
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvas.width, i * cellSize);
      ctx.stroke();
    }

    // Draw Food
    const food = foodRef.current;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#f43f5e';
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(
      (food.x + 0.5) * cellSize,
      (food.y + 0.5) * cellSize,
      cellSize * 0.35,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw Snake with Interpolation
    const snake = snakeRef.current;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    snake.forEach((segment, i) => {
      let x = segment.x;
      let y = segment.y;

      // Interpolate head and body
      if (gameState === 'PLAYING') {
        if (i === 0) {
          // Head moves forward
          x += directionRef.current.x * clampedProgress;
          y += directionRef.current.y * clampedProgress;
        } else {
          // Body segments follow the segment in front
          const prev = snake[i - 1];
          x += (prev.x - x) * clampedProgress;
          y += (prev.y - y) * clampedProgress;
        }
      }

      // Squirm effect: subtle pulse based on time and segment index
      const squirm = Math.sin(time / 150 + i * 0.8) * 0.08;
      const isHead = i === 0;
      
      const glow = isHead ? 25 : 12;
      const opacity = isHead ? 1 : Math.max(0.2, 1 - i / snake.length);
      const color = isHead ? '#22d3ee' : `rgba(34, 211, 238, ${opacity})`;

      ctx.shadowBlur = glow * (1 + squirm * 0.5);
      ctx.shadowColor = '#22d3ee';
      ctx.fillStyle = color;
      
      // Dynamic padding creates the "breathing" or "squirming" effect
      const basePadding = cellSize * 0.1;
      const dynamicPadding = basePadding + (squirm * cellSize * 0.15);
      
      ctx.fillRect(
        x * cellSize + dynamicPadding,
        y * cellSize + dynamicPadding,
        cellSize - dynamicPadding * 2,
        cellSize - dynamicPadding * 2
      );
    });
    
    ctx.shadowBlur = 0;
  };

  // --- Effects ---
  useEffect(() => {
    if (gameState === 'PLAYING') {
      requestRef.current = requestAnimationFrame(update);
    } else {
      cancelAnimationFrame(requestRef.current);
      draw(performance.now()); // Draw static state
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [gameState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const dir = directionRef.current;

      if (key === 'ArrowUp' && dir.y === 0) nextDirectionRef.current = { x: 0, y: -1 };
      if (key === 'ArrowDown' && dir.y === 0) nextDirectionRef.current = { x: 0, y: 1 };
      if (key === 'ArrowLeft' && dir.x === 0) nextDirectionRef.current = { x: -1, y: 0 };
      if (key === 'ArrowRight' && dir.x === 0) nextDirectionRef.current = { x: 1, y: 0 };
      
      if (key === ' ') {
        if (gameState === 'PLAYING') setGameState('PAUSED');
        else if (gameState === 'PAUSED') setGameState('PLAYING');
        else if (gameState === 'START' || gameState === 'GAME_OVER') resetGame();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  useEffect(() => {
    const saved = localStorage.getItem('snakeHighScore');
    if (saved) setHighScore(parseInt(saved, 10));
    
    // Initial draw
    draw(0);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 font-sans selection:bg-cyan-500/30 overflow-hidden">
      {/* Header */}
      <div className="w-full max-w-md flex items-center justify-between mb-8">
        <div className="flex flex-col">
          <h1 className="text-3xl font-black tracking-tighter italic uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center gap-2">
            <Zap className="fill-cyan-400 text-cyan-400" size={24} />
            Neon Snake
          </h1>
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 uppercase tracking-[0.3em]">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
            Engine: 60FPS Smooth
          </div>
        </div>
        
        <div className="flex gap-4">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full hover:bg-slate-800 transition-colors text-slate-400"
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2 text-rose-400 font-mono text-xs opacity-60">
              <Trophy size={12} />
              <span>{highScore.toString().padStart(5, '0')}</span>
            </div>
            <div className="text-2xl font-black font-mono text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
              {score.toString().padStart(5, '0')}
            </div>
          </div>
        </div>
      </div>

      {/* Game Board Container */}
      <div className="relative group">
        <div className="absolute -inset-2 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 rounded-2xl blur-xl opacity-50 group-hover:opacity-100 transition duration-1000"></div>
        
        <div className="relative bg-slate-900 border-2 border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <canvas 
            ref={canvasRef}
            width={800}
            height={800}
            className="bg-slate-950/50"
            style={{ 
              width: 'min(90vw, 450px)',
              height: 'min(90vw, 450px)',
              imageRendering: 'pixelated'
            }}
          />

          {/* Overlays */}
          <AnimatePresence>
            {gameState !== 'PLAYING' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md p-6 text-center"
              >
                {gameState === 'START' && (
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="space-y-8"
                  >
                    <div className="space-y-3">
                      <h2 className="text-5xl font-black text-white italic uppercase tracking-tighter">Ready?</h2>
                      <p className="text-slate-400 text-sm font-medium tracking-wide">Select your difficulty level.</p>
                    </div>

                    <div className="flex gap-2 justify-center">
                      {(Object.keys(DIFFICULTIES) as DifficultyKey[]).map((key) => (
                        <button
                          key={key}
                          onClick={() => setDifficulty(key)}
                          className={`px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-widest transition-all border-2 ${
                            difficulty === key 
                              ? `bg-slate-800 border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]` 
                              : `bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700`
                          }`}
                        >
                          {DIFFICULTIES[key].label}
                        </button>
                      ))}
                    </div>

                    <button 
                      onClick={resetGame}
                      className={`group relative px-10 py-5 bg-cyan-500 text-slate-950 font-black uppercase tracking-widest rounded-full hover:bg-cyan-400 transition-all hover:scale-105 active:scale-95 flex items-center gap-3 mx-auto shadow-[0_0_30px_rgba(6,182,212,0.4)]`}
                    >
                      <Play size={24} fill="currentColor" />
                      Initialize
                    </button>
                  </motion.div>
                )}

                {gameState === 'PAUSED' && (
                  <motion.div 
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    className="space-y-6"
                  >
                    <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">Standby</h2>
                    <button 
                      onClick={() => setGameState('PLAYING')}
                      className="px-8 py-4 bg-cyan-500 text-slate-950 font-black uppercase tracking-widest rounded-full hover:bg-cyan-400 transition-all flex items-center gap-3 mx-auto shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                    >
                      <Play size={20} fill="currentColor" />
                      Resume
                    </button>
                  </motion.div>
                )}

                {gameState === 'GAME_OVER' && (
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="space-y-8"
                  >
                    <div className="space-y-3">
                      <h2 className="text-5xl font-black text-rose-500 italic uppercase tracking-tighter">Critical Failure</h2>
                      <p className="text-slate-400 text-sm font-medium">Final Score: <span className="text-white font-bold">{score}</span></p>
                    </div>

                    <div className="flex gap-2 justify-center">
                      {(Object.keys(DIFFICULTIES) as DifficultyKey[]).map((key) => (
                        <button
                          key={key}
                          onClick={() => setDifficulty(key)}
                          className={`px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-widest transition-all border-2 ${
                            difficulty === key 
                              ? `bg-slate-800 border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]` 
                              : `bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700`
                          }`}
                        >
                          {DIFFICULTIES[key].label}
                        </button>
                      ))}
                    </div>

                    <button 
                      onClick={resetGame}
                      className="px-10 py-5 bg-rose-500 text-white font-black uppercase tracking-widest rounded-full hover:bg-rose-400 transition-all flex items-center gap-3 mx-auto shadow-[0_0_30px_rgba(244,63,94,0.4)]"
                    >
                      <RotateCcw size={24} />
                      Reboot
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Controls (Mobile Friendly) */}
      <div className="mt-10 grid grid-cols-3 gap-3 md:hidden">
        <div />
        <ControlButton 
          icon={<ChevronUp />} 
          onClick={() => directionRef.current.y === 0 && (nextDirectionRef.current = { x: 0, y: -1 })} 
          active={nextDirectionRef.current.y === -1}
        />
        <div />
        <ControlButton 
          icon={<ChevronLeft />} 
          onClick={() => directionRef.current.x === 0 && (nextDirectionRef.current = { x: -1, y: 0 })} 
          active={nextDirectionRef.current.x === -1}
        />
        <ControlButton 
          icon={<ChevronDown />} 
          onClick={() => directionRef.current.y === 0 && (nextDirectionRef.current = { x: 0, y: 1 })} 
          active={nextDirectionRef.current.y === 1}
        />
        <ControlButton 
          icon={<ChevronRight />} 
          onClick={() => directionRef.current.x === 0 && (nextDirectionRef.current = { x: 1, y: 0 })} 
          active={nextDirectionRef.current.x === 1}
        />
      </div>

      {/* Desktop Instructions */}
      <div className="mt-8 hidden md:flex items-center gap-10 text-slate-500 text-[10px] font-mono uppercase tracking-[0.2em]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <kbd className="px-2 py-1 bg-slate-900 rounded border border-slate-800 text-slate-400">↑</kbd>
            <kbd className="px-2 py-1 bg-slate-900 rounded border border-slate-800 text-slate-400">↓</kbd>
            <kbd className="px-2 py-1 bg-slate-900 rounded border border-slate-800 text-slate-400">←</kbd>
            <kbd className="px-2 py-1 bg-slate-900 rounded border border-slate-800 text-slate-400">→</kbd>
          </div>
          <span>Navigation</span>
        </div>
        <div className="flex items-center gap-3">
          <kbd className="px-3 py-1 bg-slate-900 rounded border border-slate-800 text-slate-400">SPACE</kbd>
          <span>Action</span>
        </div>
      </div>
    </div>
  );
}

function ControlButton({ icon, onClick, active }: { icon: React.ReactNode, onClick: () => void, active?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={`w-14 h-14 flex items-center justify-center rounded-xl border-2 transition-all active:scale-90 ${
        active 
          ? 'bg-cyan-500 border-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.4)]' 
          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
      }`}
    >
      {React.cloneElement(icon as React.ReactElement, { size: 28 })}
    </button>
  );
}

