"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { Orb, type AgentState } from "./orb";
import { cn } from "@/lib/utils";

export interface VoicePoweredOrbProps {
  /** Explicit agent state: "talking", "listening", "thinking", or null */
  agentState?: AgentState;
  /** Whether microphone voice capture should drive the orb reactions */
  enableVoiceControl?: boolean;
  /** Callback notifying parent when candidate voice is detected */
  onVoiceDetected?: (detected: boolean) => void;
  /** Custom colors tuple [color1, color2] */
  colors?: [string, string];
  /** Custom CSS classes */
  className?: string;
  /** Volume mode: "auto" generates procedural pulses, "manual" uses explicit volume levels */
  volumeMode?: "auto" | "manual";
  /** Optional manual input audio volume (0 to 1) */
  manualInput?: number;
  /** Optional manual output audio volume (0 to 1) */
  manualOutput?: number;
  /** Optional size variant */
  size?: "compact" | "default" | "large";
}

// Semantic luxury color palettes mapped to AI Agent consciousness states
const ORB_STATE_COLORS: Record<NonNullable<AgentState>, [string, string]> = {
  // Talking / Speaking: Radiant titanium silver & luminous platinum
  talking: ["#94a3b8", "#f8fafc"],
  // Listening: Focused electric cyan & deep sapphire blue
  listening: ["#0284c7", "#38bdf8"],
  // Thinking / Reasoning: Luminous celestial indigo & titanium violet
  thinking: ["#6366f1", "#a855f7"],
};

const DEFAULT_IDLE_COLORS: [string, string] = ["#475569", "#cbd5e1"];

export const VoicePoweredOrb: React.FC<VoicePoweredOrbProps> = ({
  agentState = null,
  enableVoiceControl = false,
  onVoiceDetected,
  colors,
  className,
  volumeMode = "auto",
  manualInput,
  manualOutput,
  size = "default",
}) => {
  const [internalInputVolume, setInternalInputVolume] = useState<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Derive dynamic color palette based on current consciousness state
  const resolvedColors: [string, string] = useMemo(() => {
    if (colors) return colors;
    if (agentState && ORB_STATE_COLORS[agentState]) {
      return ORB_STATE_COLORS[agentState];
    }
    return DEFAULT_IDLE_COLORS;
  }, [colors, agentState]);

  // Optional local mic audio volume analysis when enableVoiceControl is active
  useEffect(() => {
    if (!enableVoiceControl) {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setInternalInputVolume(0);
      onVoiceDetected?.(false);
      return;
    }

    let isMounted = true;

    async function initVoiceDetection() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const analyze = () => {
          if (!isMounted) return;
          analyser.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const normalized = Math.min(1, Math.max(0, avg / 128));

          setInternalInputVolume(normalized);
          const hasVoice = normalized > 0.08;
          onVoiceDetected?.(hasVoice);

          animationFrameRef.current = requestAnimationFrame(analyze);
        };

        analyze();
      } catch (err) {
        console.warn("Microphone access not available for VoicePoweredOrb:", err);
      }
    }

    initVoiceDetection();

    return () => {
      isMounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [enableVoiceControl, onVoiceDetected]);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden transition-all duration-500",
        size === "compact" && "w-28 h-28 md:w-32 md:h-32 max-w-full max-h-full aspect-square",
        size === "default" && "w-60 h-60 md:w-72 md:h-72 max-w-full max-h-full aspect-square",
        size === "large" && "w-80 h-80 md:w-96 md:h-96 lg:w-[420px] lg:h-[420px] max-w-full max-h-full aspect-square",
        className
      )}
    >
      {/* Ambient background bloom matching active state colors */}
      <div
        className="absolute inset-0 pointer-events-none rounded-full blur-3xl opacity-25 transition-all duration-700"
        style={{
          background: `radial-gradient(circle, ${resolvedColors[1]} 0%, ${resolvedColors[0]} 60%, transparent 80%)`,
        }}
      />

      {/* Core 3D Shader Orb */}
      <Orb
        colors={resolvedColors}
        agentState={agentState}
        volumeMode={enableVoiceControl ? "manual" : volumeMode}
        manualInput={enableVoiceControl ? internalInputVolume : manualInput}
        manualOutput={manualOutput}
        className="w-full h-full relative z-10"
      />
    </div>
  );
};

export default VoicePoweredOrb;
