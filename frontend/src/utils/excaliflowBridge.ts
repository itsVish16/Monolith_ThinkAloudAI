/**
 * ExcaliFlow Whiteboard Bridge
 *
 * Typed postMessage client for the embedded ExcaliFlow whiteboard
 * (served from `public/excaliflow/index.html`). Lets the interview studio:
 *  - read the live scene (elements) for the LiveKit whiteboard graph sync
 *  - export the diagram as a JPEG/PNG data URL for design submission
 *  - switch the canvas theme (dark/light) to match the studio chrome
 *
 * Protocol (see the bridge script at the end of the vendored index.html):
 *   host -> frame: { __thinkaloud: true, id, type, payload }
 *   frame -> host: { __excaliflow: true, id, ok, payload, error }
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const HOST_SOURCE = 'thinkaloud-host';

interface BridgeResponse {
  __excaliflow?: boolean;
  source?: string;
  id?: string;
  ok?: boolean;
  payload?: any;
  error?: string | null;
  /** Unsolicited lifecycle events (e.g. "ready") carry no id */
  event?: string;
}

interface PendingRequest {
  resolve: (payload: any) => void;
  reject: (err: Error) => void;
  timer: number;
}

export interface ElementLike {
  id?: string;
  type?: string;
  text?: string;
  isDeleted?: boolean;
  startBinding?: { elementId?: string } | null;
  endBinding?: { elementId?: string } | null;
  [key: string]: any;
}

export interface ExcaliflowBridgeApi {
  /** True once the whiteboard frame has answered a ping / announced readiness */
  ready: boolean;
  /** Snapshot of the active canvas scene (deep-cloned, safe to traverse) */
  getElements: () => Promise<ElementLike[]>;
  /** Renders a cropped export of the diagram and returns it as a data URL */
  getExport: (opts?: { scale?: number; mime?: string; quality?: number }) => Promise<string>;
  /** Switch the whiteboard canvas between the neon black and paper white themes */
  setCanvasTheme: (bg: '#000000' | '#ffffff') => Promise<void>;
}

export function useExcaliflowBridge(iframeRef: RefObject<HTMLIFrameElement | null>): ExcaliflowBridgeApi {
  const [ready, setReady] = useState(false);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const readyRef = useRef(false);
  const apiRef = useRef<Omit<ExcaliflowBridgeApi, 'ready'> | null>(null);

  const request = useCallback(<T,>(type: string, payload?: any, timeoutMs = 8000): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) {
        reject(new Error('ExcaliFlow whiteboard frame is not mounted'));
        return;
      }
      const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timer = window.setTimeout(() => {
        pendingRef.current.delete(id);
        reject(new Error(`ExcaliFlow bridge timeout (${type})`));
      }, timeoutMs);
      pendingRef.current.set(id, { resolve: resolve as (p: any) => void, reject, timer });
      win.postMessage({ __thinkaloud: true, source: HOST_SOURCE, id, type, payload }, '*');
    });
  }, [iframeRef]);

  // Listen for bridge replies and lifecycle events.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data: BridgeResponse | undefined = event.data;
      if (!data || data.__excaliflow !== true) return;
      if (data.event === 'ready') {
        readyRef.current = true;
        setReady(true);
        return;
      }
      if (!data.id) return;
      const pending = pendingRef.current.get(data.id);
      if (!pending) return;
      pendingRef.current.delete(data.id);
      window.clearTimeout(pending.timer);
      if (data.ok) pending.resolve(data.payload);
      else pending.reject(new Error(data.error || 'ExcaliFlow bridge error'));
    };
    window.addEventListener('message', onMessage);
    const pendingAtCleanup = pendingRef.current;
    return () => {
      window.removeEventListener('message', onMessage);
      pendingAtCleanup.forEach((p) => window.clearTimeout(p.timer));
      pendingAtCleanup.clear();
    };
  }, []);

  // Ping the frame until it answers — covers reloads, remounts and a missed
  // "ready" announcement (e.g. the frame booted before this listener attached).
  useEffect(() => {
    let disposed = false;
    let attempts = 0;
    const interval = window.setInterval(() => {
      if (disposed || readyRef.current || attempts >= 40) {
        window.clearInterval(interval);
        return;
      }
      attempts += 1;
      request<{ ready: boolean }>('ping', undefined, 1500)
        .then(() => {
          if (disposed) return;
          readyRef.current = true;
          setReady(true);
        })
        .catch(() => {
          /* frame still booting — retry on the next tick */
        });
    }, 1000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [request]);

  if (!apiRef.current) {
    apiRef.current = {
      getElements: async () => {
        const res = await request<{ elements: ElementLike[] }>('get-elements', undefined, 6000);
        return res?.elements || [];
      },
      getExport: async (opts) => {
        const res = await request<{ dataUrl: string }>(
          'get-export',
          {
            scale: opts?.scale ?? 2,
            mime: opts?.mime ?? 'image/jpeg',
            quality: opts?.quality ?? 0.85,
          },
          12000,
        );
        return res?.dataUrl || '';
      },
      setCanvasTheme: async (bg) => {
        await request('set-canvas-theme', { bg }, 4000);
      },
    };
  }

  return { ready, ...apiRef.current };
}
