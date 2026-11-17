import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  speed: number;
  phase: number;
  color: string;
}

const STAR_COLORS = ["255,255,255", "190,200,255", "205,185,255"];

/**
 * Fixed, full-screen space backdrop: violet/blue glow, faint grid, twinkling
 * star field and a glowing planet horizon. Purely decorative.
 */
export default function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;

    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let stars: Star[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;

    function draw(time: number) {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        const twinkle = reduceMotion
          ? 1
          : 0.55 + 0.45 * Math.sin(time * star.speed + star.phase);
        ctx.globalAlpha = star.baseAlpha * twinkle;
        ctx.fillStyle = `rgb(${star.color})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.round((width * height) / 9000);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.1 + 0.25,
        baseAlpha: Math.random() * 0.6 + 0.25,
        speed: Math.random() * 1.2 + 0.4,
        phase: Math.random() * Math.PI * 2,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
      }));
      draw(0);
    }

    function loop(timestamp: number) {
      draw(timestamp / 1000);
      frame = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener("resize", resize);
    if (!reduceMotion) {
      frame = requestAnimationFrame(loop);
    }

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#05060b]"
    >
      <div className="space-glow" />
      <div className="space-grid" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="space-horizon" />
    </div>
  );
}
