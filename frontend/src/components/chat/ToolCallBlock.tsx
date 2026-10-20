import {
  CheckCircle2,
  Loader2,
  Sparkles,
  Terminal,
  Database,
  Globe,
  Search,
  Wrench,
  Code,
  FileText,
  Map,
  Calculator,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import type { ToolExecution } from "../../state/chatReducer";

interface ToolCallBlockProps {
  tool: ToolExecution;
}

const iconMap: Record<string, React.ElementType> = {
  sparkles: Sparkles,
  terminal: Terminal,
  database: Database,
  globe: Globe,
  search: Search,
  code: Code,
  file: FileText,
  fileText: FileText,
  map: Map,
  roadmap: Map,
  calculator: Calculator,
  image: ImageIcon,
  wrench: Wrench,
};

function pickIcon(name: string): React.ComponentType<{ size?: number; className?: string }> {
  if (!name) return Wrench;
  return (iconMap[name.toLowerCase()] ?? Wrench) as React.ComponentType<{
    size?: number;
    className?: string;
  }>;
}

export function ToolCallBlock({ tool }: ToolCallBlockProps) {
  const Icon = pickIcon(tool.icon);
  const isRunning = tool.status === "running" || tool.status === "pending";
  const isFailed = tool.status === "failed";

  return (
    <div
      className={`chat-tool-call-card ${isFailed ? "is-failed" : ""}`}
    >
      <div className="chat-tool-call-toggle" role="status">
        <div className="chat-tool-call-status">
          {isRunning ? (
            <Loader2 size={16} className="chat-tool-call-spin" />
          ) : isFailed ? (
            <AlertCircle size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}
        </div>

        <div className="chat-tool-call-copy">
          <h4 className="chat-tool-call-title">
            <Icon size={14} className="chat-tool-call-title-icon" />
            {tool.title}
          </h4>
          <p className="chat-tool-call-description">
            {isRunning ? tool.description : tool.outputSummary || (isFailed ? "Failed" : "Completed")}
            {tool.duration && !isRunning && ` · ${(tool.duration / 1000).toFixed(1)}s`}
          </p>
        </div>
      </div>
    </div>
  );
}
