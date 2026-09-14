// src/components/SketchCanvas.tsx
// Freehand drawing surface for the capture tool's "Draw" mode
// (CaptureSheet.tsx) — see MOBILE_CAPTURE_TOOLS_HANDOFF.md for why this is
// a separate mode rather than merged into the text Note tool.
//
// No new native dependency: built on react-native-gesture-handler and
// react-native-svg, both already installed for other reasons (navigation,
// map/route rendering). Each stroke becomes an SVG path; the whole
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

import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

export interface SketchCanvasHandle {
  undo: () => void;
  clear: () => void;
  /** Serializes the current drawing as a standalone SVG XML string (white
   * background baked in) — null if nothing's been drawn yet, or the
   * canvas hasn't been laid out (size unknown) yet. */
  exportSvg: () => string | null;
}

interface Props {
  strokeColor?: string;
  strokeWidth?: number;
  /** Fires whenever the number of committed strokes changes, so the
   * parent can enable/disable Save/Undo/Clear without polling a ref. */
  onStrokeCountChange?: (count: number) => void;
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(function SketchCanvas(
  { strokeColor = '#1a1a1a', strokeWidth = 4, onStrokeCountChange },
  ref
) {
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [size, setSize] = useState({ width: 0, height: 0 });

  const beginPath = useCallback((x: number, y: number) => {
    setCurrentPath(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
  }, []);

  const extendPath = useCallback((x: number, y: number) => {
    setCurrentPath((prev) => (prev ? `${prev} L ${x.toFixed(1)} ${y.toFixed(1)}` : `M ${x.toFixed(1)} ${y.toFixed(1)}`));
  }, []);

  const commitPath = useCallback(() => {
    setCurrentPath((prev) => {
      if (prev) {
        setPaths((p) => {
          const next = [...p, prev];
          onStrokeCountChange?.(next.length);
          return next;
        });
      }
      return '';
    });
  }, [onStrokeCountChange]);

  // minDistance(0): a drawing surface should register the very first
  // touch-move as ink, not wait for a threshold meant for distinguishing
  // a pan gesture from a tap elsewhere in the app.
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      runOnJS(beginPath)(e.x, e.y);
    })
    .onUpdate((e) => {
      runOnJS(extendPath)(e.x, e.y);
    })
    .onEnd(() => {
      runOnJS(commitPath)();
    });

  useImperativeHandle(ref, () => ({
    undo: () => {
      setPaths((p) => {
        const next = p.slice(0, -1);
        onStrokeCountChange?.(next.length);
        return next;
      });
    },
    clear: () => {
      setPaths([]);
      setCurrentPath('');
      onStrokeCountChange?.(0);
    },
    exportSvg: () => {
      if (paths.length === 0 || size.width === 0 || size.height === 0) return null;
      const w = Math.round(size.width);
      const h = Math.round(size.height);
      const pathTags = paths
        .map((d) => `<path d="${escapeXmlAttr(d)}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
        .join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#ffffff"/>${pathTags}</svg>`;
    },
  }), [paths, size, strokeColor, strokeWidth, onStrokeCountChange]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  return (
    <GestureDetector gesture={pan}>
      <View testID="sketch-canvas" style={styles.canvas} onLayout={onLayout}>
        <Svg width="100%" height="100%">
          <Rect x={0} y={0} width="100%" height="100%" fill="#ffffff" />
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {currentPath ? (
            <Path d={currentPath} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
