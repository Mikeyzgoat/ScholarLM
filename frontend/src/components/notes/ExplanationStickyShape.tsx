import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  useEditor,
  type RecordProps,
  type TLShape,
} from "tldraw";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Sparkles,
} from "lucide-react";
import { useTheme } from "../../lib/theme";

export const EXPLANATION_STICKY_SHAPE_TYPE =
  "scholar-explanation-sticky" as const;

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    [EXPLANATION_STICKY_SHAPE_TYPE]: {
      w: number;
      h: number;
      question: string;
      explanation: string;
      explanationId: string;
      expanded: boolean;
    };
  }
}

export type ExplanationStickyShape = TLShape<
  typeof EXPLANATION_STICKY_SHAPE_TYPE
>;

function StickyContent({ shape }: { shape: ExplanationStickyShape }) {
  const editor = useEditor();
  const { resolvedTheme } = useTheme();
  const light = resolvedTheme === "light";
  return (
    <HTMLContainer
      id={shape.id}
      className={`overflow-hidden rounded-xl border shadow-lg ${
        light
          ? "border-amber-300/70 bg-amber-100 text-stone-900"
          : "border-amber-700/80 bg-amber-950 text-amber-50"
      }`}
      style={{ width: shape.props.w, height: shape.props.h, pointerEvents: "none" }}
    >
      <div
        className="flex w-full cursor-grab items-start gap-2 p-4 pb-2 text-left active:cursor-grabbing"
        style={{ pointerEvents: "all" }}
      >
        <span className={light ? "mt-0.5 text-amber-700" : "mt-0.5 text-amber-300"}>
          <Sparkles size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] ${
              light ? "text-amber-700" : "text-amber-300"
            }`}
          >
            Explanation
          </span>
          <span className="line-clamp-2 block text-sm font-semibold leading-5">
            {shape.props.question}
          </span>
        </span>
        <span
          className={`mt-0.5 flex items-center gap-1 ${
            light ? "text-amber-700" : "text-amber-300"
          }`}
        >
          <GripVertical aria-hidden="true" size={14} />
          <button
            type="button"
            className="rounded p-0.5 hover:bg-amber-500/20"
            aria-label={shape.props.expanded ? "Collapse note" : "Expand note"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              editor.updateShape<ExplanationStickyShape>({
                id: shape.id,
                type: EXPLANATION_STICKY_SHAPE_TYPE,
                props: {
                  expanded: !shape.props.expanded,
                  h: shape.props.expanded ? 112 : 360,
                },
              });
            }}
          >
            {shape.props.expanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </button>
        </span>
      </div>
      {shape.props.expanded && (
        <div
          className={`mx-4 h-[265px] overflow-y-auto border-t pt-3 text-[13px] leading-5 whitespace-pre-wrap ${
            light
              ? "border-amber-300/70 text-stone-800"
              : "border-amber-700/70 text-amber-50"
          }`}
          style={{ pointerEvents: "all" }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {shape.props.explanation}
        </div>
      )}
    </HTMLContainer>
  );
}

export class ExplanationStickyShapeUtil extends BaseBoxShapeUtil<ExplanationStickyShape> {
  static override type = EXPLANATION_STICKY_SHAPE_TYPE;
  static override props: RecordProps<ExplanationStickyShape> = {
    w: T.number,
    h: T.number,
    question: T.string,
    explanation: T.string,
    explanationId: T.string,
    expanded: T.boolean,
  };

  override getDefaultProps(): ExplanationStickyShape["props"] {
    return {
      w: 340,
      h: 112,
      question: "Question",
      explanation: "",
      explanationId: "",
      expanded: false,
    };
  }

  override canEdit() {
    return false;
  }

  override isAspectRatioLocked() {
    return true;
  }

  override getGeometry(shape: ExplanationStickyShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: ExplanationStickyShape) {
    return <StickyContent shape={shape} />;
  }

  override getIndicatorPath(shape: ExplanationStickyShape): Path2D {
    const path = new Path2D();
    path.roundRect(
      0,
      0,
      shape.props.w,
      shape.props.h,
      12,
    );
    return path;
  }
}

export const explanationStickyShapeUtils = [ExplanationStickyShapeUtil];
