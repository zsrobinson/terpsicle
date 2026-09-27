import { cn } from "cn";
import { Crop, EyeOff, RotateCcw } from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import {
  isUsableBox,
  type Point,
  type Rect,
  rectFrom,
  toImagePoint,
} from "~/core/feedback/redact";
import { Button } from "~/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/ui/dialog";
import { WithTooltip } from "~/ui/tooltip";
import { editShot, paintEdits, type Shot, ShotTooBigError } from "./screenshot";
import { TOO_BIG } from "./send";

// The screenshot's tiny editor: drag to black out, or switch to Crop and
// drag the part to keep. A canvas and ~/core/feedback/redact's geometry;
// nothing leaves until the person sends.

type Tool = "hide" | "crop";

export function RedactEditor({
  shot,
  onClose,
  onDone,
}: {
  shot: Shot;
  onClose: () => void;
  onDone: (next: Shot) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("hide");
  const [boxes, setBoxes] = useState<Rect[]>([]);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const image = { width: shot.source.width, height: shot.source.height };

  const dragged = drag ? rectFrom(drag.from, drag.to) : null;
  const shownBoxes = dragged && tool === "hide" ? [...boxes, dragged] : boxes;
  const shownCrop = dragged && tool === "crop" ? dragged : crop;

  useEffect(() => {
    const el = canvas.current;
    if (el) paintEdits(el, shot.source, shownCrop, shownBoxes);
  });

  const point = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const r = event.currentTarget.getBoundingClientRect();
    return toImagePoint(
      { x: event.clientX - r.left, y: event.clientY - r.top },
      { width: r.width, height: r.height },
      image,
    );
  };

  const finish = () => {
    if (!dragged) return;
    setDrag(null);
    if (!isUsableBox(dragged)) return;
    if (tool === "hide") setBoxes((b) => [...b, dragged]);
    else setCrop(dragged);
  };

  const done = async () => {
    setSaving(true);
    setError(null);
    try {
      onDone(await editShot(shot, crop, boxes));
    } catch (e) {
      setError(
        e instanceof ShotTooBigError
          ? TOO_BIG
          : "Couldn't save the changes. Try again.",
      );
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        data-feedback-ui=""
        className="max-w-[min(960px,calc(100vw-32px))] p-4"
      >
        <DialogTitle>Edit the screenshot</DialogTitle>
        <DialogDescription className="mb-3 text-sm">
          {tool === "hide"
            ? "Drag over anything you'd rather we didn't see."
            : "Drag around the part to keep."}
        </DialogDescription>
        <div className="mb-3 flex flex-wrap items-center gap-1">
          <div role="radiogroup" aria-label="Tool" className="flex gap-1">
            {(
              [
                ["hide", "Black out", EyeOff, "Drag to cover part of it"],
                ["crop", "Crop", Crop, "Drag to keep only part of it"],
              ] as const
            ).map(([id, label, Icon, tip]) => (
              <WithTooltip key={id} label={tip}>
                {/* biome-ignore lint/a11y/useSemanticElements: a segmented control, styled as buttons */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={tool === id}
                  onClick={() => setTool(id)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md border px-2 font-medium text-sm transition-colors",
                    tool === id
                      ? "border-fg bg-hover text-fg"
                      : "border-hairline text-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  <Icon size={14} aria-hidden="true" />
                  {label}
                </button>
              </WithTooltip>
            ))}
          </div>
          <WithTooltip label="Remove every box and the crop">
            <Button
              variant="ghost"
              size="sm"
              disabled={boxes.length === 0 && crop === null}
              onClick={() => {
                setBoxes([]);
                setCrop(null);
              }}
            >
              <RotateCcw aria-hidden="true" />
              Start over
            </Button>
          </WithTooltip>
        </div>
        <canvas
          ref={canvas}
          width={image.width}
          height={image.height}
          aria-label="The screenshot. Drag on it to black out or crop."
          role="img"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = point(e);
            setDrag({ from: p, to: p });
          }}
          onPointerMove={(e) => {
            if (drag) setDrag({ from: drag.from, to: point(e) });
          }}
          onPointerUp={finish}
          onPointerCancel={() => setDrag(null)}
          className="mx-auto block max-h-[60vh] w-auto max-w-full cursor-crosshair touch-none rounded-md border border-hairline"
        />
        {error ? (
          <p role="alert" className="mt-2 text-sm">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex justify-end gap-2">
          <WithTooltip label="Keep the screenshot as it was" shortcut="Esc">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </WithTooltip>
          <WithTooltip label="Use the edited screenshot">
            <Button onClick={() => void done()} disabled={saving}>
              {saving ? "Saving…" : "Done"}
            </Button>
          </WithTooltip>
        </div>
      </DialogContent>
    </Dialog>
  );
}
