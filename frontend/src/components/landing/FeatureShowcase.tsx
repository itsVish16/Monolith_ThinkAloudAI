import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  Code2,
  Database,
  Layers,
  MessageSquare,
  Mic,
  Server,
  ShieldCheck,
  Trophy,
  Volume2,
  Zap,
} from 'lucide-react';
import '../../styles/FeatureShowcase.css';

interface FeatureShowcaseProps {
  onNavigate: (page: string, params?: Record<string, unknown>) => void;
}

interface ShowcaseFeature {
  id: 'voice' | 'editor' | 'canvas' | 'chat';
  index: string;
  tag: string;
  title: string;
  titleAccent: string;
  desc: string;
  cta: string;
  target: string;
  icon: typeof Mic;
  image?: {
    src: string;
    alt: string;
    /** width ÷ height — drives the card's aspect ratio */
    ar: number;
  };
}

const FEATURES: ShowcaseFeature[] = [
  {
    id: 'voice',
    index: '01',
    tag: 'Voice',
    title: 'Say it the way',
    titleAccent: 'you will in the room.',
    desc: 'The interviewer listens, follows up, and presses on the decision you skipped past.',
    cta: 'Start a voice round',
    target: 'interview-types',
    icon: Mic,
  },
  {
    id: 'editor',
    index: '02',
    tag: 'Coding',
    title: 'Write the solution.',
    titleAccent: 'Defend the approach.',
    desc: 'Work in the editor and explain each choice while the interviewer is still with you.',
    cta: 'Practice coding',
    target: 'practice',
    icon: Code2,
    image: {
      src: '/features/dsa-interview.webp',
      alt: 'DSA interview workspace with a coding problem open',
      ar: 1.777,
    },
  },
  {
    id: 'canvas',
    index: '03',
    tag: 'System design',
    title: 'Draw the system.',
    titleAccent: 'Name the trade-off.',
    desc: 'Put the architecture on the whiteboard and walk through what fails when the constraints change.',
    cta: 'Start a design round',
    target: 'interview-types',
    icon: Layers,
    image: {
      src: '/features/system-design.webp',
      alt: 'System design whiteboard',
      ar: 1.777,
    },
  },
  {
    id: 'chat',
    index: '04',
    tag: 'Study plan',
    title: 'Leave with a plan,',
    titleAccent: 'not a vague next step.',
    desc: 'After a round, ask what to work on. The gaps become a study plan you can follow.',
    cta: 'Build a study plan',
    target: 'chat',
    icon: MessageSquare,
    image: {
      src: '/features/ai-chat.webp',
      alt: 'Study assistant suggesting practice problems and a roadmap',
      ar: 1.494,
    },
  },
];

const WAVE_HEIGHTS = [38, 62, 44, 84, 56, 92, 48, 74, 40, 88, 58, 96, 46, 70, 52, 82, 42, 90, 60, 76, 48, 86, 54, 78];

const SCORE_BARS = [
  { name: 'Clarity', value: 94 },
  { name: 'Rigor', value: 92 },
  { name: 'Decomposition', value: 88 },
];

/* Product visuals — shared by the sticky stage and the mobile steps */
const Visual = ({ feature }: { feature: ShowcaseFeature }) => {
  /* Real screenshot (steps 02–04) */
  if (feature.image) {
    return (
      <figure className="ff-shot" style={{ '--ff-ar': feature.image.ar } as CSSProperties}>
        <img src={feature.image.src} alt={feature.image.alt} decoding="async" />
      </figure>
    );
  }

  /* Animated mock (step 01 — real-time voice, which a still can't capture) */
  if (feature.id === 'voice') {
    return (
      <div className="ff-visual ff-voice">
        <div className="ff-voice-head">
          <span className="ff-voice-orb">
            <Volume2 size={20} />
          </span>
          <span className="ff-voice-meta">
            <b>Aarav · Interviewer</b>
            <i>
              <span className="ff-live-dot" />
              Listening
            </i>
          </span>
        </div>

        <div className="ff-wave-row" aria-hidden="true">
          {WAVE_HEIGHTS.map((h, idx) => (
            <span
              key={idx}
              className={`ff-wave-bar ${idx % 5 === 0 ? 'accent' : ''}`}
              style={{ height: `${h}%`, animationDelay: `${idx * 0.06}s` }}
            />
          ))}
        </div>

        <div className="ff-transcript">
          <div className="ff-t-bubble candidate">
            <span className="ff-t-who">You</span>
            <p>“Hash map of complements — O(N).”</p>
          </div>
          <div className="ff-t-bubble ai">
            <span className="ff-t-who">Aarav</span>
            <p>“Good. And if memory is capped at O(1)?”</p>
          </div>
        </div>
      </div>
    );
  }

  if (feature.id === 'editor') {
    return (
      <div className="ff-visual ff-editor">
        <div className="ff-code">
          <div className="ff-code-gutter" aria-hidden="true">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
          <pre className="ff-code-pre">
            <code>
              <span className="ff-c-kw">class</span> <span className="ff-c-cls">Solution</span>:{'\n'}
              {'    '}
              <span className="ff-c-kw">def</span> <span className="ff-c-fn">twoSum</span>(self, nums, target):{'\n'}
              {'        '}seen = {'{}'}
              {'\n'}
              {'        '}
              <span className="ff-c-kw">for</span> i, num <span className="ff-c-kw">in</span> enumerate(nums):{' '}
              {'\n'}
              {'            '}complement = target - num{'\n'}
              {'            '}
              <span className="ff-c-kw">if</span> complement <span className="ff-c-kw">in</span> seen:{'\n'}
              {'                '}
              <span className="ff-c-kw">return</span> [seen[complement], i]{'\n'}
              {'            '}seen[num] = i
            </code>
          </pre>
        </div>

        <div className="ff-chips">
          <span className="ff-chip" style={{ '--i': 0 } as CSSProperties}>
            <Check size={11} strokeWidth={3} />
            Sample cases passed
          </span>
          <span className="ff-chip accent" style={{ '--i': 1 } as CSSProperties}>
            <ShieldCheck size={11} />
            Hidden cases passed
          </span>
        </div>
      </div>
    );
  }

  if (feature.id === 'canvas') {
    return (
      <div className="ff-visual ff-canvas">
        <div className="ff-arch">
          <div className="ff-arch-node">
            <span className="ff-arch-ic">
              <Activity size={13} />
            </span>
            <span className="ff-arch-name">Global CDN</span>
            <span className="ff-arch-sub">edge cache</span>
          </div>
          <span className="ff-arch-arrow" aria-hidden="true">
            →
          </span>
          <div className="ff-arch-node">
            <span className="ff-arch-ic">
              <Server size={13} />
            </span>
            <span className="ff-arch-name">API Gateway</span>
            <span className="ff-arch-sub">entry point</span>
          </div>
          <span className="ff-arch-arrow" aria-hidden="true">
            →
          </span>
          <div className="ff-arch-stack">
            <div className="ff-arch-node">
              <span className="ff-arch-ic">
                <Zap size={13} />
              </span>
              <span className="ff-arch-name">Redis Cluster</span>
              <span className="ff-arch-sub">cache</span>
            </div>
            <div className="ff-arch-node">
              <span className="ff-arch-ic">
                <Database size={13} />
              </span>
              <span className="ff-arch-name">Postgres Shards</span>
              <span className="ff-arch-sub">master + replicas</span>
            </div>
          </div>
        </div>

      </div>
    );
  }

  return (
    <div className="ff-visual ff-score">
      <div className="ff-score-head">
        <span className="ff-score-verdict">
          <Trophy size={13} />
          Strong hire
        </span>
      </div>

      <div className="ff-score-bars">
        {SCORE_BARS.map((bar, idx) => (
          <div key={bar.name} className="ff-bar-row">
            <div className="ff-bar-label">
              <span>{bar.name}</span>
              <b>{bar.value}%</b>
            </div>
            <div className="ff-bar-track">
              <span
                className="ff-bar-fill"
                style={{ '--w': `${bar.value}%`, transitionDelay: `${0.25 + idx * 0.12}s` } as CSSProperties}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="ff-score-pills">
        <span className="ff-score-pill">Timestamped replay</span>
        <span className="ff-score-pill">Gap → roadmap</span>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------
   Animated beam backdrop — ported from Animata's "AnimatedBeam".
   Deterministic 0–1 pseudo-random from an integer so every beam
   gets its own length / speed / width / brightness — identical on
   every render, no measurement, no resize listeners.
   --------------------------------------------------------------- */
const prand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const lerp = (min: number, max: number, t: number) => min + (max - min) * t;

// Enough 40px lanes to cover wide screens; extras are clipped by overflow-hidden.
const BEAM_LANES = 64;

function MeteorBeam({ index }: { index: number }) {
  // ~30% are quick zips (1.2–3.2s); the rest drift slowly (6–14s).
  const fast = prand(index + 91) < 0.3;
  const duration = fast ? lerp(1.2, 3.2, prand(index)) : lerp(6, 14, prand(index));
  const delay = lerp(0, 9, prand(index + 13));
  const length = Math.round(lerp(24, 84, prand(index + 29))); // streak length
  const width = Math.round(lerp(3, 7, prand(index + 53)));
  // fast streaks read brighter, like real meteors
  const opacity = fast ? lerp(0.8, 1, prand(index + 71)) : lerp(0.35, 0.9, prand(index + 71));

  return (
    <div
      className="ff-ab-beam"
      style={
        {
          '--duration': `${duration.toFixed(2)}s`,
          '--delay': `${delay.toFixed(2)}s`,
          '--length': `${length}px`,
          '--opacity': opacity.toFixed(2),
          width: `${width}px`,
        } as CSSProperties
      }
    >
      <div className="ff-ab-streak">
        <div className="ff-ab-streak-fill" />
      </div>
    </div>
  );
}

function BeamBackdrop() {
  return (
    <div className="ff-ab-bg" aria-hidden="true">
      {/* soft teal glow pooling in the lower half */}
      <div className="ff-ab-glow" />

      {/* fixed-width lanes → constant 40px spacing, clipped to whatever fits */}
      {Array.from({ length: BEAM_LANES }, (_, i) => (
        <div key={i} className="ff-ab-lane">
          <div className="ff-ab-line">
            {/* beam rides this diagonal line; ~30% of lanes get one */}
            {prand(i + 7) < 0.3 && <MeteorBeam index={i + 1} />}
          </div>
        </div>
      ))}
    </div>
  );
}

export const FeatureShowcase = ({ onNavigate }: FeatureShowcaseProps) => {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    let raf = 0;
    let current = -1;

    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      let best = current < 0 ? 0 : current;
      let bestDist = Number.POSITIVE_INFINITY;

      stepRefs.current.forEach((step, i) => {
        if (!step) return;
        const rect = step.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const dist = Math.abs(center - vh / 2);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });

      if (best !== current) {
        current = best;
        setActive(best);
      }
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const jumpTo = (index: number) => {
    stepRefs.current[index]?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
  };

  return (
    <section className="ff-section" id="features" aria-label="What you practice">
      <div className="ff-header">
        <div className="ff-eyebrow">
          <span className="ff-eyebrow-dot" />
          <span>What you practice</span>
        </div>
        <h2 className="ff-heading">
          The whole interview. <em>Not just the answer.</em>
        </h2>
      </div>

      <div className="ff-scrolly ff-console">
        {/* Animated beam backdrop — indigo night sky with meteor streaks */}
        <BeamBackdrop />

        {/* Scrolling narrative */}
        <div className="ff-steps">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.id}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className={`ff-step ${i === active ? 'is-active' : ''}`}
              >
                <div className="ff-step-inner">
                  <span className="ff-ghost" aria-hidden="true">
                    {feature.index}
                  </span>

                  <span className="ff-tag">
                    <Icon size={13} />
                    {feature.tag}
                  </span>

                  <h3 className="ff-title">
                    {feature.title} <em>{feature.titleAccent}</em>
                  </h3>

                  <p className="ff-desc">{feature.desc}</p>

                  <div className="ff-meta">
                    <button
                      type="button"
                      className="ff-link"
                      onClick={() => {
                        if (feature.target === 'chat' && !localStorage.getItem('access_token')) {
                          onNavigate('signup');
                          return;
                        }
                        onNavigate(feature.target);
                      }}
                    >
                      {feature.cta}
                      <ArrowRight size={14} />
                    </button>
                  </div>

                  {/* Inline visual below 1000px (sticky stage hidden there) */}
                  <div className="ff-step-visual">
                    <Visual feature={feature} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Pinned, crossfading stage */}
        <div className="ff-stage-col" aria-hidden="true">
          <div className="ff-stage-sticky">
            <span className="ff-stage-glow" />
            <div className="ff-stage">
              <div className="ff-stage-body">
                {FEATURES.map((feature, i) => (
                  <div key={feature.id} className={`ff-stage-visual ${i === active ? 'active' : ''}`}>
                    <Visual feature={feature} />
                  </div>
                ))}
              </div>
            </div>

            <div className="ff-stage-footer">
              <span className="ff-counter">
                <b>{FEATURES[active].index}</b> / 04
              </span>
              <div className="ff-progress">
                {FEATURES.map((feature, i) => (
                  <button
                    key={feature.id}
                    type="button"
                    className={`ff-progress-seg ${i === active ? 'active' : ''} ${i < active ? 'done' : ''}`}
                    onClick={() => jumpTo(i)}
                    aria-label={`Scroll to ${feature.tag}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeatureShowcase;
