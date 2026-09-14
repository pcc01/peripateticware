// src/components/SketchCanvas.tsx
// Freehand drawing surface for the capture tool's "Draw" mode
// (CaptureSheet.tsx) — see MOBILE_CAPTURE_TOOLS_HANDOFF.md for why this is
// a separate mode rather than merged into the text Note tool.
//
// No new native dependency: built on react-native-gesture-handler and
// react-native-svg, both already installed for other reasons (navigation,
// map/route rendering). Each stroke/shape becomes an SVG element; the whole
// drawing exports as a standalone SVG XML string (white background baked
// in) rather than a rasterized PNG — react-native-svg can render that
// straight back via <SvgUri>/<SvgXml> (see CapturePreviewModal.tsx), and
// browsers render .svg natively in a plain <img>, so the existing
// teacher-review web views need no changes. See the handoff doc for why
// rasterizing wasn't necessary for v1.
//
// Gesture callbacks run as UI-thread worklets (react-native-reanimated is
// installed, which gesture-handler detects and uses) — state updates must
// go through runOnJS rather than calling setState directly inside them.
//
// EXTENDED 2026-09-14: color/thickness/shape-tool support. Each committed
// element carries its OWN color+width baked in at the moment it was
// drawn (not the current tool props) — changing color afterward must not
// retroactively repaint earlier strokes, matching how every ordinary
// drawing app behaves. `tool` picks what a NEW gesture produces: 'pen' is
// the original freehand path; 'line'/'rect'/'ellipse' are drag-to-size
// shapes (start point on touch-down, live preview while dragging, commit
// on release) — small enough drags (a tap, not a drag) are discarded
// rather than committing a zero-size shape.

import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Path, Rect, Line, Ellipse } from 'react-native-svg';

export type SketchTool = 'pen' | 'line' | 'rect' | 'ellipse';

interface StrokeElement {
  tool: 'pen';
  color: string;
  strokeWidth: number;
  d: string;
}
interface ShapeElement {
  tool: 'line' | 'rect' | 'ellipse';
  color: string;
  strokeWidth: number;
  x1: number; y1: number; x2: number; y2: number;
}
type SketchElement = StrokeElement | ShapeElement;

// A drag shorter than this (in either axis) is treated as a mis-tap, not a
// deliberate zero-size shape — matches the "minDistance(0)" pan's own
// touch-first-move-is-ink philosophy for pen mode, just applied to "was
// this drag big enough to mean something" for shapes instead.
const MIN_SHAPE_DRAG = 3;

export interface SketchCanvasHandle {
  undo: () => void;
  clear: () => void;
  /** Serializes the current drawing as a standalone SVG XML string (white
   * background baked in) — null if nothing's been drawn yet, or the
   * canvas hasn't been laid out (size unknown) yet. */
  exportSvg: () => string | null;
}

interface Props {
  /** Which tool a NEW stroke/shape uses. Already-committed elements keep
   * whatever tool/color/width they were drawn with. Defaults to 'pen'. */
  tool?: SketchTool;
  color?: string;
  strokeWidth?: number;
  /** Fires whenever the number of committed elements changes, so the
   * parent can enable/disable Save/Undo/Clear without polling a ref. */
  onStrokeCountChange?: (count: number) => void;
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function shapeBounds(el: { x1: number; y1: number; x2: number; y2: number }) {
  const x = Math.min(el.x1, el.x2);
  const y = Math.min(el.y1, el.y2);
  const width = Math.abs(el.x2 - el.x1);
  const height = Math.abs(el.y2 - el.y1);
  return { x, y, width, height };
}

function elementToSvgTag(el: SketchElement): string {
  if (el.tool === 'pen') {
    return `<path d="${escapeXmlAttr(el.d)}" stroke="${el.color}" stroke-width="${el.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (el.tool === 'line') {
    return `<line x1="${el.x1.toFixed(1)}" y1="${el.y1.toFixed(1)}" x2="${el.x2.toFixed(1)}" y2="${el.y2.toFixed(1)}" stroke="${el.color}" stroke-width="${el.strokeWidth}" stroke-linecap="round"/>`;
  }
  const { x, y, width, height } = shapeBounds(el);
  if (el.tool === 'rect') {
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" stroke="${el.color}" stroke-width="${el.strokeWidth}" fill="none"/>`;
  }
  // ellipse
  return `<ellipse cx="${(x + width / 2).toFixed(1)}" cy="${(y + height / 2).toFixed(1)}" rx="${(width / 2).toFixed(1)}" ry="${(height / 2).toFixed(1)}" stroke="${el.color}" stroke-width="${el.strokeWidth}" fill="none"/>`;
}

function RenderElement({ el }: { el: SketchElement }) {
  if (el.tool === 'pen') {
    return <Path d={el.d} stroke={el.color} strokeWidth={el.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (el.tool === 'line') {
    return <Line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.color} strokeWidth={el.strokeWidth} strokeLinecap="round" />;
  }
  const { x, y, width, height } = shapeBounds(el);
  if (el.tool === 'rect') {
    return <Rect x={x} y={y} width={width} height={height} stroke={el.color} strokeWidth={el.strokeWidth} fill="none" />;
  }
  return <Ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} stroke={el.color} strokeWidth={el.strokeWidth} fill="none" />;
}

const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(function SketchCanvas(
  { tool = 'pen', color = '#1a1a1a', strokeWidth = 4, onStrokeCountChange },
  ref
) {
  const [elements, setElements] = useState<SketchElement[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [shapePreview, setShapePreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const beginElement = useCallback((x: number, y: number) => {
    if (tool === 'pen') {
      setCurrentPath(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
    } else {
      setShapePreview({ x1: x, y1: y, x2: x, y2: y });
    }
  }, [tool]);

  const updateElement = useCallback((x: number, y: number) => {
    if (tool === 'pen') {
      setCurrentPath((prev) => (prev ? `${prev} L ${x.toFixed(1)} ${y.toFixed(1)}` : `M ${x.toFixed(1)} ${y.toFixed(1)}`));
    } else {
      setShapePreview((prev) => (prev ? { ...prev, x2: x, y2: y } : prev));
    }
  }, [tool]);

  const commitElement = useCallback(() => {
    if (tool === 'pen') {
      setCurrentPath((prev) => {
        if (prev) {
          setElements((els) => {
            const next: SketchElement[] = [...els, { tool: 'pen', color, strokeWidth, d: prev }];
            onStrokeCountChange?.(next.length);
            return next;
          });
        }
        return '';
      });
    } else {
      setShapePreview((prev) => {
        if (prev && (Math.abs(prev.x2 - prev.x1) >= MIN_SHAPE_DRAG || Math.abs(prev.y2 - prev.y1) >= MIN_SHAPE_DRAG)) {
          setElements((els) => {
            const next: SketchElement[] = [...els, { tool, color, strokeWidth, ...prev }];
            onStrokeCountChange?.(next.length);
            return next;
          });
        }
        return null;
      });
    }
  }, [tool, color, strokeWidth, onStrokeCountChange]);

  // minDistance(0): a drawing surface should register the very first
  // touch-move as ink/a shape's first corner, not wait for a threshold
  // meant for distinguishing a pan gesture from a tap elsewhere in the app.
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      runOnJS(beginElement)(e.x, e.y);
    })
    .onUpdate((e) => {
      runOnJS(updateElement)(e.x, e.y);
    })
    .onEnd(() => {
      runOnJS(commitElement)();
    });

  useImperativeHandle(ref, () => ({
    undo: () => {
      setElements((els) => {
        const next = els.slice(0, -1);
        onStrokeCountChange?.(next.length);
        return next;
      });
    },
    clear: () => {
      setElements([]);
      setCurrentPath('');
      setShapePreview(null);
      onStrokeCountChange?.(0);
    },
    exportSvg: () => {
      if (elements.length === 0 || size.width === 0 || size.height === 0) return null;
      const w = Math.round(size.width);
      const h = Math.round(size.height);
      const tags = elements.map(elementToSvgTag).join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#ffffff"/>${tags}</svg>`;
    },
  }), [elements, size]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  return (
    <GestureDetector gesture={pan}>
      <View testID="sketch-canvas" style={styles.canvas} onLayout={onLayout}>
        <Svg width="100%" height="100%">
          <Rect x={0} y={0} width="100%" height="100%" fill="#ffffff" />
          {elements.map((el, i) => (
            <RenderElement key={i} el={el} />
          ))}
          {currentPath ? (
            <Path d={currentPath} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
          {shapePreview ? (
            <RenderElement el={{ tool: tool as 'line' | 'rect' | 'ellipse', color, strokeWidth, ...shapePreview }} />
          ) : null}
        </Svg>
      </View>
    </GestureDetector>
  );
});

export default SketchCanvas;

const styles = StyleSheet.create({
  canvas: { flex: 1, borderRadius: 8, overflow: 'hidden' },
});
