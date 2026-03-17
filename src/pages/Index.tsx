import { useState, useEffect, useRef, useCallback } from "react";

type Screen = "menu" | "levels" | "game" | "pause" | "gameover" | "records" | "settings";
type Direction = "left" | "right";

interface ParticleType {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
}

const LEVELS = [
  { id: 1, name: "НАЧАЛО", color: "#00ff88", wallGap: 200, speed: 3, unlocked: true },
  { id: 2, name: "РАЗГОН", color: "#00ccff", wallGap: 180, speed: 4, unlocked: false },
  { id: 3, name: "ШТОРМ", color: "#ff6600", wallGap: 160, speed: 5, unlocked: false },
  { id: 4, name: "ХАОС", color: "#ff0066", wallGap: 140, speed: 6, unlocked: false },
  { id: 5, name: "АД", color: "#ff0000", wallGap: 120, speed: 7, unlocked: false },
];

const INITIAL_RECORDS = [
  { name: "ИГРОК1", score: 8400, level: 3 },
  { name: "PIXEL", score: 5200, level: 2 },
  { name: "RETRO", score: 3100, level: 1 },
];

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>(0);
  const gameStateRef = useRef({
    playerX: 0,
    playerY: 0,
    playerVY: 0,
    direction: "right" as Direction,
    score: 0,
    combo: 0,
    multiplier: 1,
    lastJumpTime: 0,
    obstacles: [] as { y: number; gapX: number; gapW: number; speed: number; passed: boolean }[],
    particles: [] as ParticleType[],
    stars: [] as Star[],
    frameCount: 0,
    running: false,
    wallBounceEffect: 0,
    trailPoints: [] as { x: number; y: number; alpha: number }[],
  });

  const [screen, setScreen] = useState<Screen>("menu");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState(0);
  const [levels, setLevels] = useState(LEVELS);
  const [records, setRecords] = useState(INITIAL_RECORDS);
  const [settings, setSettings] = useState({ sound: true, vibration: true, particles: true });
  const [finalScore, setFinalScore] = useState(0);
  const [comboFlash, setComboFlash] = useState(false);

  const selectedLevelRef = useRef(selectedLevel);
  useEffect(() => { selectedLevelRef.current = selectedLevel; }, [selectedLevel]);

  const initGame = useCallback((levelIdx: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    const gs = gameStateRef.current;

    gs.playerX = W / 2;
    gs.playerY = H * 0.3;
    gs.playerVY = 0;
    gs.direction = "right";
    gs.score = 0;
    gs.combo = 0;
    gs.multiplier = 1;
    gs.lastJumpTime = 0;
    gs.obstacles = [];
    gs.particles = [];
    gs.trailPoints = [];
    gs.frameCount = 0;
    gs.wallBounceEffect = 0;
    gs.running = true;

    gs.stars = Array.from({ length: 60 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.8 + 0.2,
      speed: Math.random() * 0.5 + 0.2,
    }));
  }, []);

  const spawnParticles = (x: number, y: number, color: string, count: number) => {
    const gs = gameStateRef.current;
    for (let i = 0; i < count; i++) {
      gs.particles.push({
        id: Math.random(),
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 1,
        color,
        size: Math.random() * 4 + 2,
      });
    }
  };

  const jump = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs.running) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;

    gs.direction = gs.direction === "right" ? "left" : "right";
    gs.playerX = gs.direction === "right" ? 40 : W - 40;
    gs.playerVY = -8;
    gs.wallBounceEffect = 15;

    const now = Date.now();
    const timeDiff = now - gs.lastJumpTime;
    if (gs.lastJumpTime > 0 && timeDiff < 1500) {
      gs.combo++;
      gs.multiplier = Math.min(8, 1 + Math.floor(gs.combo / 3));
      setComboFlash(true);
      setTimeout(() => setComboFlash(false), 300);
    } else {
      gs.combo = 0;
      gs.multiplier = 1;
    }
    gs.lastJumpTime = now;

    const color = gs.direction === "right" ? "#00ff88" : "#00ccff";
    spawnParticles(gs.playerX, gs.playerY, color, 8);

    setCombo(gs.combo);
    setMultiplier(gs.multiplier);
  }, []);

  const startGameLoop = useCallback((levelIdx: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const level = LEVELS[levelIdx];
    const gs = gameStateRef.current;

    let obstacleTimer = 0;
    const obstacleInterval = 80;
    const gravity = 0.4;
    const WALL_L = 30;
    const WALL_R = W - 30;
    const PLAYER_SIZE = 12;

    const loop = () => {
      if (!gs.running) return;

      gs.frameCount++;

      // Считаем таймер только когда нет активного препятствия на экране
      const hasActiveObstacle = gs.obstacles.some(o => o.y < gs.playerY + 100);
      if (!hasActiveObstacle) {
        obstacleTimer++;
      }
      if (obstacleTimer >= obstacleInterval) {
        obstacleTimer = 0;
        const gapW = level.wallGap;
        // Гэп всегда у той стены, где сейчас игрок
        const playerIsRight = gs.direction === "right";
        const gapX = playerIsRight
          ? WALL_L + 2
          : WALL_R - gapW - 2;
        gs.obstacles.push({ y: -20, gapX, gapW, speed: level.speed, passed: false });
      }

      gs.stars.forEach(s => {
        s.y += s.speed;
        if (s.y > H) s.y = 0;
      });

      gs.playerVY += gravity;
      gs.playerY += gs.playerVY;

      const targetX = gs.direction === "right" ? WALL_L + PLAYER_SIZE : WALL_R - PLAYER_SIZE;
      gs.playerX += (targetX - gs.playerX) * 0.3;

      gs.trailPoints.unshift({ x: gs.playerX, y: gs.playerY, alpha: 1 });
      if (gs.trailPoints.length > 12) gs.trailPoints.pop();
      gs.trailPoints.forEach(p => p.alpha *= 0.8);

      gs.obstacles = gs.obstacles.filter(o => o.y < H + 40);
      let died = false;
      gs.obstacles.forEach(o => {
        o.y += o.speed;

        if (!o.passed && o.y > gs.playerY) {
          o.passed = true;
          gs.score += 100 * gs.multiplier;
          setScore(gs.score);
          setLevels(prev => prev.map((l, i) => {
            if (!l.unlocked && gs.score > i * 500) return { ...l, unlocked: true };
            return l;
          }));
        }

        if (!died && Math.abs(gs.playerY - o.y) < 10) {
          const px = gs.playerX;
          const half = PLAYER_SIZE / 2;
          if (px - half < o.gapX || px + half > o.gapX + o.gapW) {
            died = true;
          }
        }
      });

      if (died || gs.playerY > H - 20 || gs.playerY < 20) {
        gs.running = false;
        spawnParticles(gs.playerX, gs.playerY, "#ff0066", 20);
        setFinalScore(gs.score);
        setRecords(prev => {
          const newR = [...prev, { name: "YOU", score: gs.score, level: levelIdx + 1 }];
          return newR.sort((a, b) => b.score - a.score).slice(0, 10);
        });
        setTimeout(() => setScreen("gameover"), 500);
        return;
      }

      gs.particles = gs.particles.filter(p => p.life > 0.05);
      gs.particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life *= 0.92;
        p.size *= 0.95;
      });

      if (gs.wallBounceEffect > 0) gs.wallBounceEffect--;

      // === DRAW ===
      ctx.fillStyle = "#050510";
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "rgba(0,100,255,0.05)";
      ctx.lineWidth = 1;
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Stars
      gs.stars.forEach(s => {
        ctx.fillStyle = `rgba(255,255,255,${s.opacity})`;
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), Math.ceil(s.size), Math.ceil(s.size));
      });

      // Left wall
      const leftActive = gs.wallBounceEffect > 0 && gs.direction === "left";
      const rightActive = gs.wallBounceEffect > 0 && gs.direction === "right";
      ctx.fillStyle = leftActive ? "#00ff88" : "#1a2a4a";
      if (leftActive) { ctx.shadowColor = "#00ff88"; ctx.shadowBlur = 20; }
      ctx.fillRect(0, 0, WALL_L, H);
      ctx.shadowBlur = 0;

      ctx.fillStyle = rightActive ? "#00ccff" : "#1a2a4a";
      if (rightActive) { ctx.shadowColor = "#00ccff"; ctx.shadowBlur = 20; }
      ctx.fillRect(WALL_R, 0, W - WALL_R, H);
      ctx.shadowBlur = 0;

      // Wall pixel grid
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      for (let y = 0; y < H; y += 16) {
        ctx.fillRect(2, y, WALL_L - 4, 2);
        ctx.fillRect(WALL_R + 2, y, W - WALL_R - 4, 2);
      }

      // Obstacles
      gs.obstacles.forEach(o => {
        const obstY = Math.floor(o.y);
        ctx.shadowColor = level.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = level.color;
        ctx.fillRect(WALL_L, obstY - 8, o.gapX - WALL_L, 16);
        ctx.fillRect(o.gapX + o.gapW, obstY - 8, WALL_R - (o.gapX + o.gapW), 16);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(WALL_L, obstY - 8, o.gapX - WALL_L, 3);
        ctx.fillRect(o.gapX + o.gapW, obstY - 8, WALL_R - (o.gapX + o.gapW), 3);
      });

      // Trail
      gs.trailPoints.forEach((p, i) => {
        const size = PLAYER_SIZE * (1 - i / gs.trailPoints.length) * 0.8;
        const isRight = gs.direction === "right";
        ctx.fillStyle = `rgba(${isRight ? "0,204,255" : "0,255,136"},${p.alpha * 0.5})`;
        ctx.fillRect(Math.floor(p.x - size / 2), Math.floor(p.y - size / 2), Math.ceil(size), Math.ceil(size));
      });

      // Player
      const px = Math.floor(gs.playerX);
      const py = Math.floor(gs.playerY);
      const playerColor = gs.direction === "right" ? "#00ff88" : "#00ccff";
      ctx.shadowColor = playerColor;
      ctx.shadowBlur = 16;
      ctx.fillStyle = playerColor;
      ctx.fillRect(px - PLAYER_SIZE / 2, py - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#050510";
      if (gs.direction === "right") {
        ctx.fillRect(px + 2, py - 4, 3, 3);
      } else {
        ctx.fillRect(px - 5, py - 4, 3, 3);
      }
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillRect(px - PLAYER_SIZE / 2, py - PLAYER_SIZE / 2, 3, 3);

      // Particles
      gs.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.floor(p.x - p.size / 2), Math.floor(p.y - p.size / 2), Math.ceil(p.size), Math.ceil(p.size));
      });
      ctx.globalAlpha = 1;

      // Score HUD on canvas
      ctx.font = "10px 'Press Start 2P'";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.shadowColor = "#00ff88";
      ctx.shadowBlur = 6;
      ctx.fillText(`${gs.score}`, WALL_L + 10, 30);
      ctx.shadowBlur = 0;

      gameLoopRef.current = requestAnimationFrame(loop);
    };

    gameLoopRef.current = requestAnimationFrame(loop);
  }, []);

  const handleTap = useCallback(() => {
    if (screen === "game") jump();
  }, [screen, jump]);

  const pauseGame = useCallback(() => {
    const gs = gameStateRef.current;
    gs.running = false;
    cancelAnimationFrame(gameLoopRef.current);
    setScreen("pause");
  }, []);

  const resumeGame = useCallback(() => {
    const gs = gameStateRef.current;
    gs.running = true;
    setScreen("game");
    setTimeout(() => startGameLoop(selectedLevelRef.current), 50);
  }, [startGameLoop]);

  const startGame = useCallback((levelIdx: number) => {
    cancelAnimationFrame(gameLoopRef.current);
    setSelectedLevel(levelIdx);
    setScore(0);
    setCombo(0);
    setMultiplier(1);
    setScreen("game");
    setTimeout(() => {
      initGame(levelIdx);
      startGameLoop(levelIdx);
    }, 50);
  }, [initGame, startGameLoop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: Event) => { e.preventDefault(); handleTap(); };
    canvas.addEventListener("touchstart", handler, { passive: false });
    canvas.addEventListener("mousedown", handler);
    return () => {
      canvas.removeEventListener("touchstart", handler);
      canvas.removeEventListener("mousedown", handler);
    };
  }, [handleTap]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); handleTap(); }
      if (e.code === "Escape" && screen === "game") pauseGame();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, handleTap, pauseGame]);

  useEffect(() => {
    return () => cancelAnimationFrame(gameLoopRef.current);
  }, []);

  // ========= SCREENS =========

  if (screen === "menu") {
    return (
      <div className="game-screen" style={{ background: "#050510" }}>
        <div className="scanlines" />
        <div className="pixel-grid" />
        <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 0 }}>
          <div style={{ marginBottom: 28, textAlign: "center" }}>
            <div style={{ fontFamily: "'Press Start 2P'", fontSize: "clamp(22px,6vw,36px)", color: "#00ff88", textShadow: "0 0 20px #00ff88, 0 0 40px #00ff88", letterSpacing: "4px", animation: "glow-pulse 2s ease-in-out infinite", lineHeight: 1.5 }}>
              WALL
            </div>
            <div style={{ fontFamily: "'Press Start 2P'", fontSize: "clamp(22px,6vw,36px)", color: "#00ccff", textShadow: "0 0 20px #00ccff, 0 0 40px #00ccff", letterSpacing: "4px", animation: "glow-pulse 2s ease-in-out infinite 0.5s", lineHeight: 1.5 }}>
              JUMP
            </div>
            <div style={{ fontFamily: "'Press Start 2P'", fontSize: "9px", color: "rgba(255,255,255,0.35)", marginTop: 6, letterSpacing: "3px" }}>
              PIXEL ARCADE v1.0
            </div>
          </div>

          <div style={{ marginBottom: 28, position: "relative", width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="menu-player" />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 280, padding: "0 20px" }}>
            <button className="pixel-btn pixel-btn-green" onClick={() => startGame(0)}>▶ ИГРАТЬ</button>
            <button className="pixel-btn pixel-btn-cyan" onClick={() => setScreen("levels")}>☰ УРОВНИ</button>
            <button className="pixel-btn pixel-btn-orange" onClick={() => setScreen("records")}>★ РЕКОРДЫ</button>
            <button className="pixel-btn pixel-btn-pink" onClick={() => setScreen("settings")}>⚙ НАСТРОЙКИ</button>
          </div>
          <div style={{ marginTop: 20, fontFamily: "'Press Start 2P'", fontSize: "7px", color: "rgba(255,255,255,0.2)", letterSpacing: "2px" }}>
            ТАП / ПРОБЕЛ — ПРЫЖОК
          </div>
        </div>
      </div>
    );
  }

  if (screen === "game" || screen === "pause") {
    return (
      <div className="game-screen" style={{ background: "#050510", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 12px", pointerEvents: "none" }}>
          <div>
            {combo > 0 && (
              <div style={{
                fontFamily: "'Press Start 2P'", fontSize: "9px",
                color: comboFlash ? "#ffff00" : "#ff6600",
                textShadow: comboFlash ? "0 0 20px #ffff00" : "0 0 10px #ff6600",
                transition: "all 0.15s",
                transform: comboFlash ? "scale(1.4)" : "scale(1)",
                display: "inline-block",
              }}>
                x{multiplier} COMBO {combo}
              </div>
            )}
          </div>
          <button style={{ fontFamily: "'Press Start 2P'", fontSize: "9px", color: "rgba(255,255,255,0.5)", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", padding: "4px 8px", cursor: "pointer", pointerEvents: "all" }} onClick={pauseGame}>
            II
          </button>
        </div>

        <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", zIndex: 10, pointerEvents: "none" }}>
          <span style={{ fontFamily: "'Press Start 2P'", fontSize: "7px", color: "rgba(255,255,255,0.18)", letterSpacing: "3px" }}>
            {LEVELS[selectedLevel]?.name}
          </span>
        </div>

        <canvas ref={canvasRef} width={400} height={700} style={{ width: "100%", height: "100%", display: "block", touchAction: "none", imageRendering: "pixelated" }} />

        {screen === "pause" && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(5,5,16,0.93)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 20 }}>
            <div style={{ fontFamily: "'Press Start 2P'", fontSize: "22px", color: "#00ff88", textShadow: "0 0 20px #00ff88", marginBottom: 12 }}>ПАУЗА</div>
            <div style={{ fontFamily: "'Press Start 2P'", fontSize: "10px", color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>СЧЁТ: {score}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 220 }}>
              <button className="pixel-btn pixel-btn-green" onClick={resumeGame}>▶ ПРОДОЛЖИТЬ</button>
              <button className="pixel-btn pixel-btn-gray" onClick={() => { gameStateRef.current.running = false; cancelAnimationFrame(gameLoopRef.current); setScreen("menu"); }}>⌂ МЕНЮ</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (screen === "gameover") {
    return (
      <div className="game-screen" style={{ background: "#050510" }}>
        <div className="scanlines" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, padding: "0 24px", position: "relative", zIndex: 2 }}>
          <div style={{ fontFamily: "'Press Start 2P'", fontSize: "clamp(20px,5vw,28px)", color: "#ff0066", textShadow: "0 0 30px #ff0066, 0 0 60px rgba(255,0,102,0.5)", animation: "glow-pulse 1s ease-in-out infinite", textAlign: "center", marginBottom: 6 }}>
            GAME<br />OVER
          </div>
          <div style={{ fontFamily: "'Press Start 2P'", fontSize: "10px", color: "rgba(255,255,255,0.4)", letterSpacing: "2px" }}>СЧЁТ</div>
          <div style={{ fontFamily: "'Press Start 2P'", fontSize: "clamp(22px,7vw,32px)", color: "#ffff00", textShadow: "0 0 20px #ffff00", marginBottom: 12 }}>
            {finalScore.toLocaleString()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 260 }}>
            <button className="pixel-btn pixel-btn-green" onClick={() => startGame(selectedLevel)}>↺ ЕЩЁ РАЗ</button>
            <button className="pixel-btn pixel-btn-cyan" onClick={() => setScreen("levels")}>☰ УРОВНИ</button>
            <button className="pixel-btn pixel-btn-orange" onClick={() => setScreen("records")}>★ РЕКОРДЫ</button>
            <button className="pixel-btn pixel-btn-gray" onClick={() => setScreen("menu")}>⌂ МЕНЮ</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "levels") {
    return (
      <div className="game-screen" style={{ background: "#050510" }}>
        <div className="scanlines" />
        <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", zIndex: 2 }}>
          <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", gap: 12 }}>
            <button className="back-btn" onClick={() => setScreen("menu")}>◄</button>
            <span style={{ fontFamily: "'Press Start 2P'", fontSize: "12px", color: "#00ff88", textShadow: "0 0 10px #00ff88" }}>УРОВНИ</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {levels.map((level, i) => (
              <div key={level.id} onClick={() => level.unlocked && startGame(i)} style={{
                border: `2px solid ${level.unlocked ? level.color : "#222244"}`,
                padding: "14px 16px",
                cursor: level.unlocked ? "pointer" : "not-allowed",
                background: level.unlocked ? "rgba(255,255,255,0.03)" : "rgba(20,20,40,0.3)",
                boxShadow: level.unlocked ? `0 0 12px ${level.color}33` : "none",
                transition: "all 0.2s",
                position: "relative",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "'Press Start 2P'", fontSize: "10px", color: level.unlocked ? level.color : "#333355", marginBottom: 6 }}>
                      {level.id}. {level.name}
                    </div>
                    <div style={{ fontFamily: "'Press Start 2P'", fontSize: "7px", color: "rgba(255,255,255,0.25)" }}>
                      СКОРОСТЬ x{level.speed} · ЗАЗОР {level.wallGap}px
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Press Start 2P'", fontSize: "16px", opacity: level.unlocked ? 1 : 0.3 }}>
                    {level.unlocked ? "►" : "🔒"}
                  </div>
                </div>
                {!level.unlocked && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: "'Press Start 2P'", fontSize: "7px", color: "rgba(255,255,255,0.18)" }}>НАБЕРИ {i * 500} ОЧК</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "records") {
    return (
      <div className="game-screen" style={{ background: "#050510" }}>
        <div className="scanlines" />
        <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", zIndex: 2 }}>
          <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", gap: 12 }}>
            <button className="back-btn" onClick={() => setScreen("menu")}>◄</button>
            <span style={{ fontFamily: "'Press Start 2P'", fontSize: "12px", color: "#ffff00", textShadow: "0 0 10px #ffff00" }}>РЕКОРДЫ</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {records.slice(0, 10).map((r, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "12px", marginBottom: 8,
                background: i === 0 ? "rgba(255,215,0,0.07)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${i === 0 ? "#ffaa00" : i < 3 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)"}`,
              }}>
                <div style={{ fontFamily: "'Press Start 2P'", fontSize: "13px", color: i === 0 ? "#ffaa00" : i === 1 ? "#aaaaaa" : i === 2 ? "#cc7700" : "rgba(255,255,255,0.25)", width: 30, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Press Start 2P'", fontSize: "9px", color: r.name === "YOU" ? "#00ff88" : "rgba(255,255,255,0.75)", marginBottom: 3 }}>
                    {r.name === "YOU" ? "★ ВЫ" : r.name}
                  </div>
                  <div style={{ fontFamily: "'Press Start 2P'", fontSize: "6px", color: "rgba(255,255,255,0.25)" }}>УР.{r.level}</div>
                </div>
                <div style={{ fontFamily: "'Press Start 2P'", fontSize: "10px", color: i === 0 ? "#ffaa00" : "#00ccff" }}>
                  {r.score.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "settings") {
    return (
      <div className="game-screen" style={{ background: "#050510" }}>
        <div className="scanlines" />
        <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", zIndex: 2 }}>
          <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", gap: 12 }}>
            <button className="back-btn" onClick={() => setScreen("menu")}>◄</button>
            <span style={{ fontFamily: "'Press Start 2P'", fontSize: "12px", color: "#ff6600", textShadow: "0 0 10px #ff6600" }}>НАСТРОЙКИ</span>
          </div>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { key: "sound", label: "ЗВУК", icon: "♪" },
              { key: "vibration", label: "ВИБРАЦИЯ", icon: "≋" },
              { key: "particles", label: "ЧАСТИЦЫ", icon: "✦" },
            ].map(item => (
              <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: "16px" }}>{item.icon}</span>
                  <span style={{ fontFamily: "'Press Start 2P'", fontSize: "9px", color: "rgba(255,255,255,0.65)" }}>{item.label}</span>
                </div>
                <div onClick={() => setSettings(s => ({ ...s, [item.key]: !s[item.key as keyof typeof s] }))} style={{
                  width: 44, height: 24,
                  background: settings[item.key as keyof typeof settings] ? "#00ff88" : "#222244",
                  border: `2px solid ${settings[item.key as keyof typeof settings] ? "#00ff88" : "#444466"}`,
                  cursor: "pointer", position: "relative",
                  boxShadow: settings[item.key as keyof typeof settings] ? "0 0 12px #00ff88" : "none",
                  transition: "all 0.2s",
                }}>
                  <div style={{ position: "absolute", top: 2, left: settings[item.key as keyof typeof settings] ? 22 : 2, width: 16, height: 16, background: "white", transition: "left 0.2s" }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontFamily: "'Press Start 2P'", fontSize: "7px", color: "rgba(255,255,255,0.25)", marginBottom: 10, letterSpacing: "2px" }}>УПРАВЛЕНИЕ</div>
              <div style={{ padding: "12px 16px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
                <div style={{ fontFamily: "'Press Start 2P'", fontSize: "8px", color: "rgba(255,255,255,0.4)", lineHeight: 2.2 }}>
                  ТАП / КЛИК — ПРЫЖОК<br />
                  ПРОБЕЛ — ПРЫЖОК<br />
                  ESC — ПАУЗА
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}