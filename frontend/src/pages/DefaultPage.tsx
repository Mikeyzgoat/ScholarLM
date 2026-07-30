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
    <div className="relative h-[12.5rem] sm:h-[15rem] lg:h-[17rem]">
      <div
        className={`absolute inset-x-0 top-0 flex min-h-[1.2em] items-baseline whitespace-nowrap font-semibold leading-[0.92] tracking-[-0.055em] ${
          pair.typed.length > 18
            ? "text-[clamp(2.5rem,6.2vw,6.8rem)]"
            : "text-[clamp(3rem,7.4vw,8rem)]"
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
        className="absolute -left-1 top-[4.5rem] block w-full max-w-[70rem] overflow-visible sm:top-[6rem] lg:top-[7.2rem]"
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
      <div className="home-billboard-art relative h-full rounded-xl border border-sky-400/15 bg-white/[0.035] p-4">
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
        className="home-billboard-art h-full w-full rounded-xl border border-orange-400/15 bg-white/[0.025] p-2"
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
      <div className="home-billboard-art grid h-full place-items-center rounded-xl border border-amber-400/15 bg-white/[0.025]">
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
      className="home-billboard-art h-full w-full rounded-xl border border-purple-400/15 bg-white/[0.025] p-2"
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
  return (
    <div className="home-product-billboard home-feature-loop relative mx-auto w-full max-w-[92rem] overflow-hidden rounded-[2rem] border border-white/10 bg-neutral-950/80 py-5 shadow-[0_36px_100px_rgba(0,0,0,0.38)]">
      <div className="home-feature-loop-track flex w-max">
        {[0, 1].map((copy) => (
          <div
            key={copy}
            className="flex shrink-0 gap-4 pr-4"
            aria-hidden={copy === 1}
          >
            {billboardSlides.map((item, index) => (
              <article
                key={`${copy}-${item.eyebrow}`}
                className={`home-billboard-slide w-[min(78vw,22rem)] shrink-0 overflow-hidden rounded-[1.35rem] border border-white/10 bg-gradient-to-br p-6 ${item.wash}`}
              >
                <div
                  className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${item.color}`}
                >
                  <item.icon size={14} />
                  {item.eyebrow}
                </div>
                <h2 className="mt-5 whitespace-pre-line text-2xl font-semibold leading-[1.04] tracking-[-0.035em]">
                  {item.title}
                </h2>
                <p className="mt-4 min-h-16 text-sm leading-6 text-stone-500">
                  {item.copy}
                </p>
                <div className="mt-5 h-32">
                  <BillboardArtwork index={index} />
                </div>
              </article>
            ))}
          </div>
        ))}
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
        className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-[92rem] flex-col justify-center px-6 py-12 lg:px-12"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
      >
        <div className="relative z-10 w-full">
          <p className="mb-8 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono uppercase text-stone-500">
            <span className="text-[clamp(1.35rem,2.3vw,2rem)] font-bold tracking-[-0.04em] text-orange-400">
              ScholarLM
            </span>
            <span className="text-[clamp(0.72rem,1vw,0.9rem)] tracking-[0.16em]">
              / a canvas for active reading
            </span>
          </p>
          <KineticHeadline />
          <p className="mt-7 max-w-2xl text-base leading-7 text-stone-500">
            Keep the PDF steady. Use the space around it to question, sketch,
            explain, and save the parts worth remembering.
          </p>
        </div>
      </motion.section>

      <section className="px-4 pb-16 sm:px-6 lg:px-12">
        <ProductBillboard />
      </section>

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
        <div className="flex flex-wrap items-center gap-3 md:justify-end">
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
      </section>
    </main>
  );
}
