"use client";

import React, { useState } from "react";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";

export default function VoicePoweredOrbPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [voiceDetected, setVoiceDetected] = useState(false);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  return (
    <div className="min-h-screen d flex items-center justify-center p-8 bg-[#070709] text-white">
      <div className="flex flex-col items-center space-y-8">
        {/* Orb */}
        <div className="w-96 h-96 relative flex items-center justify-center">
          <VoicePoweredOrb
            enableVoiceControl={isRecording}
            className="rounded-xl overflow-hidden shadow-2xl"
            onVoiceDetected={setVoiceDetected}
          />
        </div>

        {/* Control Button */}
        <Button
          onClick={toggleRecording}
          variant="outline"
          size="lg"
          className={isRecording 
            ? "px-8 py-3 bg-red-950/40 text-red-300 border-red-500/50 hover:bg-red-900/50 hover:text-white shadow-[0_0_20px_rgba(239,68,68,0.25)] rounded-full transition-all"
            : "px-8 py-3 bg-gradient-to-r from-white via-slate-100 to-slate-300 text-zinc-950 font-semibold border-white/80 shadow-[0_0_25px_rgba(255,255,255,0.25)] hover:shadow-[0_0_35px_rgba(255,255,255,0.45)] hover:scale-[1.02] rounded-full transition-all"
          }
        >
          {isRecording ? (
            <>
              <MicOff className="w-5 h-5 mr-3 text-red-400" />
              Stop Recording
            </>
          ) : (
            <>
              <Mic className="w-5 h-5 mr-3 text-zinc-900" />
              Start Recording
            </>
          )}
        </Button>

        {/* Simple Instructions */}
        <p className="text-muted-foreground text-center max-w-md text-zinc-400 text-sm">
          Click the button to enable voice control. Speak to see the orb respond to your voice with subtle movements.
        </p>

        {voiceDetected && (
          <div className="px-3 py-1 rounded-full bg-slate-400/15 border border-slate-300/30 text-slate-200 text-xs font-mono tracking-wider shadow-[0_0_15px_rgba(226,232,240,0.2)]">
            Voice Detected ● Listening
          </div>
        )}
      </div>
    </div>
  );
}
