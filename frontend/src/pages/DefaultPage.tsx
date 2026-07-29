import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  FileSearch,
  GitFork,
  MousePointer2,
  Pencil,
  StickyNote,
  Upload,
} from "lucide-react";
import { Link } from "react-router";

const headlinePairs = [
  { typed: "Read the source.", drawn: "Think beside it." },
  { typed: "Question the source.", drawn: "Keep what clicks." },
  { typed: "Draw the missing step.", drawn: "Connect the dots." },
] as const;

function KineticHeadline() {
  const reduceMotion = useReducedMotion();
  const [pairIndex, setPairIndex] = useState(0);
  const [typed, setTyped] = useState(
    reduceMotion ? headlinePairs[0].typed : "",
  );
  const [deleting, setDeleting] = useState(false);
  const pair = headlinePairs[pairIndex];

  useEffect(() => {
    if (reduceMotion) {
      setPairIndex(0);
      setTyped(headlinePairs[0].typed);
      setDeleting(false);
      return;
    }
    const complete = typed === pair.typed;
    const empty = typed.length === 0;
    const timeout = window.setTimeout(
      () => {
        if (!deleting && !complete) {
          setTyped(pair.typed.slice(0, typed.length + 1));
          return;
        }
        if (!deleting && complete) {
          setDeleting(true);
          return;
        }
        if (deleting && !empty) {
          setTyped(pair.typed.slice(0, typed.length - 1));
          return;
        }
        setDeleting(false);
        setPairIndex((index) => (index + 1) % headlinePairs.length);
      },
      !deleting && complete ? 1800 : deleting ? 28 : 58,
    );
    return () => window.clearTimeout(timeout);
  }, [deleting, pair.typed, reduceMotion, typed]);

  return (
    <div className="relative h-[10.5rem] sm:h-[12.5rem] lg:h-[14rem]">
      <div
        className={`absolute inset-x-0 top-0 flex min-h-[1.2em] items-baseline whitespace-nowrap font-semibold leading-[0.92] tracking-[-0.055em] ${
          pair.typed.length > 18
            ? "text-[clamp(2.25rem,4.7vw,4.5rem)]"
            : "text-[clamp(2.8rem,5.8vw,5.8rem)]"
        }`}
      >
        <span>{typed}</span>
        {!reduceMotion && (
          <span
            aria-hidden="true"
            className="ml-1 inline-block h-[0.8em] w-[3px] animate-pulse rounded-full bg-orange-400"
          />
        )}
      </div>
      <svg
        className="absolute -left-1 top-[3.8rem] block w-full max-w-[46rem] overflow-visible sm:top-[4.8rem] lg:top-[5.4rem]"
        viewBox="0 0 760 118"
        role="img"
        aria-label={pair.drawn}
      >
        <motion.text
          key={pairIndex}
          x="8"
          y="84"
          fill="currentColor"
          fillOpacity={reduceMotion ? 1 : 0}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1100"
          initial={
            reduceMotion
              ? false
              : { strokeDashoffset: 1100, fillOpacity: 0, opacity: 0.4 }
          }
          animate={{ strokeDashoffset: 0, fillOpacity: 1, opacity: 1 }}
          transition={{
            strokeDashoffset: { duration: 1.55, ease: "easeInOut" },
            fillOpacity: { delay: reduceMotion ? 0 : 1.15, duration: 0.45 },
            opacity: { duration: 0.2 },
          }}
          className="fill-orange-400 stroke-orange-400 text-[76px]"
          style={{
            fontFamily:
              '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
            fontWeight: 500,
            letterSpacing: "-3px",
          }}
        >
          {pair.drawn}
        </motion.text>
        <motion.path
          key={`underline-${pairIndex}`}
          d="M12 105 C 150 114, 330 94, 590 106"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.65 }}
          transition={{
            delay: reduceMotion ? 0 : 1.3,
            duration: 0.65,
            ease: "easeOut",
          }}
          className="text-orange-400"
        />
      </svg>
    </div>
  );
}

const billboardSlides = [
  {
    eyebrow: "Ask / with sources",
    title: "Your PDF,\nwith receipts.",
    copy: "Grounded answers that return you to the page they came from.",
    color: "text-sky-300",
    wash: "from-sky-500/20 via-sky-500/5 to-transparent",
    icon: FileSearch,
  },
  {
    eyebrow: "Draw / select / explain",
    title: "Sketch the step\nyou cannot phrase.",
    copy: "Select a handwritten region and turn it into an immediate explanation.",
    color: "text-orange-300",
    wash: "from-orange-500/20 via-orange-500/5 to-transparent",
    icon: Pencil,
  },
  {
    eyebrow: "Sticky / indexed",
    title: "A note that knows\nwhere it came from.",
    copy: "Move it freely. Search it later. Reopen the exact canvas location.",
    color: "text-amber-300",
    wash: "from-amber-500/20 via-amber-500/5 to-transparent",
    icon: StickyNote,
  },
  {
    eyebrow: "Graph / connected",
    title: "Follow the thought,\nnot the folder.",
    copy: "PDFs, canvases, and stickies settle into one navigable knowledge map.",
    color: "text-purple-300",
    wash: "from-purple-500/20 via-purple-500/5 to-transparent",
    icon: GitFork,
  },
] as const;

function BillboardArtwork({ index }: { index: number }) {
  if (index === 0)
    return (
      <div className="relative h-full rounded-xl border border-sky-400/15 bg-white/[0.035] p-4">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-300">
          Page 11 · cited
        </span>
        <div className="mt-4 space-y-2">
          {[92, 100, 76].map((width) => (
            <span
              key={width}
              className="block h-1.5 rounded-full bg-sky-200/20"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
        <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-sky-400/20 bg-sky-400/10 p-3 text-[10px] leading-4 text-sky-100">
          Answer grounded in the open document
        </div>
      </div>
    );
  if (index === 1)
    return (
      <svg
        className="h-full w-full rounded-xl border border-orange-400/15 bg-white/[0.025] p-2"
        viewBox="0 0 240 150"
        aria-hidden="true"
      >
        <path
          d="M18 113 C 55 104, 70 38, 105 56 S 151 128, 219 30"
          fill="none"
          stroke="#fb923c"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M38 126 C 80 138, 134 125, 191 132"
          fill="none"
          stroke="#a8a29e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="5 7"
        />
        <rect
          x="8"
          y="17"
          width="224"
          height="118"
          rx="12"
          fill="none"
          stroke="#fb923c"
          strokeOpacity=".35"
          strokeDasharray="7 6"
        />
      </svg>
    );
  if (index === 2)
    return (
      <div className="grid h-full place-items-center rounded-xl border border-amber-400/15 bg-white/[0.025]">
        <div className="w-[82%] rotate-[-2deg] rounded-xl border border-amber-400/30 bg-amber-100 p-4 text-stone-900 shadow-xl">
          <span className="text-[9px] font-bold uppercase tracking-[0.13em] text-amber-700">
            Explanation sticky
          </span>
          <p className="mt-2 text-sm font-semibold leading-5">
            Measure time and space as input size grows.
          </p>
          <span className="mt-3 block text-[9px] text-stone-500">
            Linked to PDF · Page 11
          </span>
        </div>
      </div>
    );
  return (
    <svg
      className="h-full w-full rounded-xl border border-purple-400/15 bg-white/[0.025] p-2"
      viewBox="0 0 240 150"
      aria-hidden="true"
    >
      <g stroke="#a855f7" strokeOpacity=".5" strokeWidth="2">
        <line x1="30" y1="76" x2="108" y2="34" />
        <line x1="30" y1="76" x2="108" y2="116" />
        <line x1="108" y1="34" x2="207" y2="72" />
        <line x1="108" y1="116" x2="207" y2="72" />
      </g>
      <circle cx="30" cy="76" r="13" fill="#38bdf8" />
      <circle cx="108" cy="34" r="10" fill="#c084fc" />
      <circle cx="108" cy="116" r="9" fill="#facc15" />
      <circle cx="207" cy="72" r="11" fill="#38bdf8" />
    </svg>
  );
}

function ProductBillboard() {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const slide = billboardSlides[active];

  useEffect(() => {
    if (reduceMotion || paused) return;
    const interval = window.setInterval(
      () => setActive((index) => (index + 1) % billboardSlides.length),
      4200,
    );
    return () => window.clearInterval(interval);
  }, [paused, reduceMotion]);

  return (
    <div
      className="relative mx-auto w-full max-w-[39rem] rounded-[2rem] border border-white/10 bg-neutral-950/80 p-3 shadow-[0_36px_100px_rgba(0,0,0,0.38)]"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="flex items-center justify-between px-2 pb-3 pt-1 font-mono text-[9px] uppercase tracking-[0.17em] text-stone-600">
        <span>ScholarLM feature billboard</span>
        <span>{paused ? "Paused" : "Now showing"}</span>
      </div>
      <motion.div
        key={active}
        className={`relative min-h-[27rem] overflow-hidden rounded-[1.35rem] border border-white/10 bg-gradient-to-br ${slide.wash} p-6`}
        initial={reduceMotion ? false : { opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="grid h-full min-h-[23rem] gap-6 sm:grid-cols-[1.05fr_0.95fr] sm:items-end">
          <div className="self-start">
            <div
              className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${slide.color}`}
            >
              <slide.icon size={14} />
              {slide.eyebrow}
            </div>
            <h2 className="mt-5 whitespace-pre-line text-3xl font-semibold leading-[1.04] tracking-[-0.035em]">
              {slide.title}
            </h2>
            <p className="mt-4 max-w-xs text-sm leading-6 text-stone-500">
              {slide.copy}
            </p>
          </div>
          <div className="h-44 sm:h-52">
            <BillboardArtwork index={active} />
          </div>
        </div>
      </motion.div>
      <div className="flex items-center gap-2 px-2 pb-1 pt-3">
        {billboardSlides.map((item, index) => (
          <button
            key={item.eyebrow}
            type="button"
            aria-label={`Show ${item.eyebrow}`}
            aria-pressed={active === index}
            onClick={() => setActive(index)}
            className={`h-1.5 rounded-full transition-[width,background-color] ${
              active === index
                ? "w-9 bg-orange-400"
                : "w-4 bg-stone-700 hover:bg-stone-500"
            }`}
          />
        ))}
        <span className="ml-auto font-mono text-[9px] text-stone-600">
          {String(active + 1).padStart(2, "0")} / 04
        </span>
      </div>
    </div>
  );
}

const productMoves = [
  {
    icon: MousePointer2,
    number: "01",
    title: "Point at what matters",
    text: "Select a PDF passage or a hand-drawn region. ScholarLM keeps the question attached to its source.",
  },
  {
    icon: Pencil,
    number: "02",
    title: "Work in the open space",
    text: "The PDF stays stable while explanations, sketches, and ideas occupy their own movable canvas space.",
  },
  {
    icon: FileSearch,
    number: "03",
    title: "Find the thought again",
    text: "PDF chunks and sticky notes share one search surface, then reconnect inside the knowledge graph.",
  },
] as const;

export default function DefaultPage() {
  const reduceMotion = useReducedMotion();
  return (
    <main className="overflow-hidden">
      <motion.section
        className="mx-auto grid min-h-[calc(100dvh-3.5rem)] max-w-[92rem] items-center gap-10 px-6 py-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(29rem,0.95fr)] lg:px-12"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
      >
        <div className="relative z-10">
          <p className="mb-7 font-mono text-[11px] uppercase tracking-[0.24em] text-stone-500">
            ScholarLM / a canvas for active reading
          </p>
          <KineticHeadline />
          <p className="mt-7 max-w-xl text-base leading-7 text-stone-500">
            Keep the PDF steady. Use the space around it to question, sketch,
            explain, and save the parts worth remembering.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/upload"
              className="scholar-primary-action flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold"
            >
              <Upload size={16} />
              Bring a PDF
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/notes"
              className="flex items-center gap-2 rounded-full px-4 py-3 text-sm text-stone-400 hover:bg-white/5 hover:text-stone-200"
            >
              Open your canvases
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
        <ProductBillboard />
      </motion.section>

      <section className="border-y border-white/10 bg-black/10">
        <div className="mx-auto grid max-w-[92rem] lg:grid-cols-3">
          {productMoves.map(({ icon: Icon, number, title, text }, index) => (
            <article
              key={number}
              className={`min-h-72 p-7 lg:p-9 ${
                index ? "border-t border-white/10 lg:border-l lg:border-t-0" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-orange-400">
                  {number}
                </span>
                <Icon size={19} className="text-stone-600" />
              </div>
              <h2 className="mt-16 text-2xl font-semibold tracking-tight">
                {title}
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-6 text-stone-500">
                {text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto flex max-w-[92rem] flex-col justify-between gap-8 px-6 py-16 md:flex-row md:items-center lg:px-12">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-orange-400">
            A clean demo starts with one source
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            Upload a PDF. Ask one good question. Keep the answer connected.
          </h2>
        </div>
        <Link
          to="/upload"
          className="flex shrink-0 items-center gap-3 text-sm font-semibold text-orange-300 hover:text-orange-200"
        >
          Start the workspace
          <span className="grid h-11 w-11 place-items-center rounded-full border border-orange-400/30 bg-orange-500/10">
            <ArrowRight size={18} />
          </span>
        </Link>
      </section>
    </main>
  );
}
