import React, { useEffect, useRef } from "react";

interface AiVisualizerProps {
  isConnected: boolean;
  isSpeaking: boolean;
  audioLevel?: number; // 0 to 1
  compact?: boolean;
}

export const AiVisualizer: React.FC<AiVisualizerProps> = ({
  isConnected,
  isSpeaking,
  audioLevel = 0,
  compact = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothedLevelRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const handleResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const render = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const width = parent.clientWidth;
      const height = parent.clientHeight;

      ctx.clearRect(0, 0, width, height);

      // Smooth audio level
      const targetLevel = isSpeaking
        ? Math.max(0.2, audioLevel || 0.35)
        : isConnected
        ? 0.04
        : 0.01;
      smoothedLevelRef.current += (targetLevel - smoothedLevelRef.current) * 0.14;
      const level = smoothedLevelRef.current;

      time += 0.02 + level * 0.08;

      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = compact
        ? Math.min(width, height) * 0.22
        : Math.min(width, height) * 0.25;

      // Atmospheric radial glow (Emerald & Silver chrome blend)
      const bgGrad = ctx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.1,
        cx,
        cy,
        baseRadius * 2.5
      );
      if (isSpeaking) {
        bgGrad.addColorStop(0, `rgba(52, 211, 153, ${0.12 + level * 0.25})`);
        bgGrad.addColorStop(0.4, `rgba(56, 189, 248, ${0.05 + level * 0.1})`);
        bgGrad.addColorStop(1, "rgba(5, 5, 5, 0)");
      } else {
        bgGrad.addColorStop(0, `rgba(228, 228, 231, ${0.06 + level * 0.15})`);
        bgGrad.addColorStop(0.5, `rgba(161, 161, 170, ${0.02 + level * 0.06})`);
        bgGrad.addColorStop(1, "rgba(5, 5, 5, 0)");
      }

      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Outer precision orbital rings
      const numRings = compact ? 2 : 3;
      for (let r = 0; r < numRings; r++) {
        const ringRadius = baseRadius * (1.25 + r * 0.28) + level * 14 * (r + 1);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(time * (r % 2 === 0 ? 0.18 : -0.14) + r * 1.1);

        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        const ringAlpha = 0.08 - r * 0.02 + level * 0.1;
        ctx.strokeStyle = isSpeaking
          ? `rgba(52, 211, 153, ${ringAlpha * 1.4})`
          : `rgba(212, 212, 216, ${ringAlpha})`;
        ctx.lineWidth = 1;
        ctx.setLineDash(r === 1 ? [4, 8] : [2, 12]);
        ctx.stroke();
        ctx.restore();
      }

      // Liquid Chrome / Silver & Emerald Harmonic Waveforms
      const layers = 4;
      for (let l = 0; l < layers; l++) {
        ctx.beginPath();
        const points = 120;
        const layerOffset = (l * Math.PI) / 2;
        const layerScale = 1 - l * 0.12;

        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const wave1 = Math.sin(angle * 3 + time * 1.7 + layerOffset);
          const wave2 = Math.cos(angle * 5 - time * 2.3 - layerOffset);
          const wave3 = Math.sin(angle * 8 + time * 3.1);

          const displacement =
            (wave1 * 0.45 + wave2 * 0.35 + wave3 * 0.2) *
            (baseRadius * (0.06 + level * 0.55));

          const r = baseRadius * layerScale + displacement;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.closePath();

        // Gradient stroke
        const strokeGrad = ctx.createLinearGradient(
          cx - baseRadius,
          cy - baseRadius,
          cx + baseRadius,
          cy + baseRadius
        );

        const alpha = l === 0 ? 0.9 : 0.45 - l * 0.08;
        if (isSpeaking) {
          strokeGrad.addColorStop(0, `rgba(52, 211, 153, ${alpha})`);
          strokeGrad.addColorStop(0.5, `rgba(56, 189, 248, ${alpha * 0.8})`);
          strokeGrad.addColorStop(1, `rgba(244, 244, 245, ${alpha * 0.9})`);
        } else {
          strokeGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
          strokeGrad.addColorStop(0.5, `rgba(161, 161, 170, ${alpha * 0.65})`);
          strokeGrad.addColorStop(1, `rgba(244, 244, 245, ${alpha * 0.9})`);
        }

        ctx.strokeStyle = strokeGrad;
        ctx.lineWidth = l === 0 ? 1.8 : 1;
        ctx.stroke();

        if (l === 0) {
          const coreGrad = ctx.createRadialGradient(
            cx - baseRadius * 0.25,
            cy - baseRadius * 0.25,
            baseRadius * 0.05,
            cx,
            cy,
            baseRadius * 1.1
          );
          if (isSpeaking) {
            coreGrad.addColorStop(0, `rgba(52, 211, 153, ${0.18 + level * 0.3})`);
            coreGrad.addColorStop(0.6, `rgba(6, 182, 212, ${0.08 + level * 0.15})`);
            coreGrad.addColorStop(1, "rgba(9, 10, 16, 0.5)");
          } else {
            coreGrad.addColorStop(0, `rgba(250, 250, 250, ${0.14 + level * 0.25})`);
            coreGrad.addColorStop(0.6, `rgba(113, 113, 122, ${0.06 + level * 0.1})`);
            coreGrad.addColorStop(1, "rgba(9, 9, 11, 0.4)");
          }
          ctx.fillStyle = coreGrad;
          ctx.fill();
        }
      }

      // Inner specular core dot
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5 + level * 4, 0, Math.PI * 2);
      ctx.fillStyle = isSpeaking ? "#34d399" : isConnected ? "#FFFFFF" : "rgba(161, 161, 170, 0.35)";
      ctx.fill();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [isConnected, isSpeaking, audioLevel, compact]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block pointer-events-none"
    />
  );
};
