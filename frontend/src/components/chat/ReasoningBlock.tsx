import { useState, useEffect, useId } from "react";
import { Brain, ChevronRight, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

interface ReasoningBlockProps {
  content: string;
  isThinking: boolean;
  /** When provided, shows a "Thought for Xs" label after thinking completes. */
  startedAt?: number;
  /** When true, the block represents a completed (historical) reasoning trace. */
  done?: boolean;
}

/** Detect the user's reduced-motion preference once. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export function ReasoningBlock({ content, isThinking, startedAt, done }: ReasoningBlockProps) {
  // Default to expanded while thinking, collapsed otherwise.
  const [isExpanded, setIsExpanded] = useState(isThinking);
  const [now, setNow] = useState(Date.now());
  const contentId = useId();
  const reduced = usePrefersReducedMotion();

  // Auto-collapse when thinking finishes, auto-expand when it (re)starts.
  useEffect(() => {
    setIsExpanded(isThinking);
  }, [isThinking]);

  // While thinking, tick once a second to update the live "thinking for Xs" label.
  useEffect(() => {
    if (!isThinking || !startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isThinking, startedAt]);

  const durationSec = startedAt ? ((isThinking ? now : Date.now()) - startedAt) / 1000 : undefined;

  if (!content && !isThinking) return null;

  const label = isThinking
    ? startedAt
      ? `Thinking… ${Math.max(1, Math.round(durationSec ?? 0))}s`
      : "Thinking…"
    : done || durationSec
    ? `Thought for ${(durationSec ?? 0).toFixed(1)}s`
    : "Thought Process";

  const shouldAnimate = isThinking && !reduced;

  return (
    <div className="chat-reasoning-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="chat-reasoning-toggle"
      >
        <div className="chat-reasoning-icon">
          <Brain
            size={16}
            className={shouldAnimate ? "chat-reasoning-pulse" : ""}
          />
        </div>
        <div className="chat-reasoning-title-wrap">
          <h4 className="chat-reasoning-title">{label}</h4>
        </div>
        <div className="chat-reasoning-chevron" aria-hidden="true">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={contentId}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={reduced ? {} : { height: "auto", opacity: 1 }}
            exit={reduced ? {} : { height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.2 }}
          >
            <div className="chat-reasoning-content">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p>{children}</p>,
                }}
              >
                {content || "..."}
              </ReactMarkdown>
              {isThinking && (
                <span
                  className={`ml-0.5 inline-block ${shouldAnimate ? "chat-cursor-blink" : ""}`}
                  aria-hidden="true"
                >
                  ▍
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
