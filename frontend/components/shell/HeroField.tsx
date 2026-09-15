"use client";

import { useEffect, useRef } from "react";

/**
 * The hero's living background: a 3D wave field of glowing nodes and fine
 * connecting lines, flowing continuously toward the viewer, with occasional
 * vertical signal beams rising off the crests.
 *
 * ── Why raw WebGL and not Three.js ────────────────────────────────────────
 * This is one surface, a handful of draw calls and about 150 lines of shader.
 * Three.js would add ~150KB gzipped to a marketing page whose whole job is
 * loading fast, and we'd use perhaps 2% of it. Everything below is plain
 * WebGL with no dependencies.
 *
 * ── How the motion stays seamless ─────────────────────────────────────────
 * The grid never resets. Each point's depth is `fract(row + time * speed)`,
 * so a point reaching the far plane wraps back around to the near plane — and
 * because height is a pure function of *world* position, the wrapped point
 * already has exactly the height that location calls for. Nothing pops,
 * because the far plane has faded to zero alpha before the wrap happens: the
 * recycling occurs in territory the eye can't see.
 *
 * ── Readability ──────────────────────────────────────────────────────────
 * An elliptical mask centred on the headline pulls the field down to ~8%
 * brightness behind the text. The field is at its busiest out toward the
 * edges, where there's nothing to read.
 */

// ---------------------------------------------------------------------------
// Field geometry. COLS * ROWS stays under 65,536 so line indices fit in 16
// bits and we don't need OES_element_index_uint.
// ---------------------------------------------------------------------------
const COLS = 150;
const ROWS = 90;
const FIELD_HALF_WIDTH = 22.0;
const FIELD_DEPTH = 52.0;
// Tall waves and a camera sitting *below* the mean surface, so near crests
// project above the eye line and the field fills the frame top to bottom.
// With the camera above the surface you get a horizon, and everything lands in
// the lower half — which is exactly how the first version looked wrong.
const WAVE_AMPLITUDE = 5.5;
const BEAM_COUNT = 16;

// Shared by both programs so the beams sit on exactly the same surface as the
// mesh. Any drift here would show up as beams floating off the waves.
const PROJECTION = `
const float NEAR = 2.2;
const float FOCAL = 1.28;
const float CAM_Y = -0.6;
const float AMP = ${WAVE_AMPLITUDE.toFixed(2)};
const float HALF_W = ${FIELD_HALF_WIDTH.toFixed(1)};
const float DEPTH = ${FIELD_DEPTH.toFixed(1)};

// Layered sines rather than noise: cheap, and the smooth rolling swell reads
// as a data surface rather than as terrain.
float waveHeight(vec2 p, float t) {
  float h = 0.0;
  h += 0.62 * sin(p.x * 0.42 + t * 0.26);
  h += 0.44 * sin(p.y * 0.38 - t * 0.31);
  h += 0.30 * sin((p.x * 0.31 + p.y * 0.44) + t * 0.20);
  h += 0.17 * sin((p.x * 0.85 - p.y * 0.62) - t * 0.37);
  h += 0.09 * sin((p.x * 1.60 + p.y * 1.20) + t * 0.46);
  return h;
}

vec2 project(vec3 world, float aspect) {
  float viewZ = world.z + NEAR;
  vec2 ndc = vec2(world.x, world.y - CAM_Y) * FOCAL / viewZ;
  ndc.x /= aspect;
  return ndc;
}

// Left-to-right brand gradient: magenta and violet on the left, indigo
// through the middle, blue into cyan on the right.
vec3 fieldColor(float xNorm) {
  vec3 magenta = vec3(0.76, 0.24, 0.87);
  vec3 violet  = vec3(0.49, 0.36, 1.00);
  vec3 indigo  = vec3(0.29, 0.35, 0.95);
  vec3 blue    = vec3(0.22, 0.60, 0.98);
  vec3 cyan    = vec3(0.24, 0.85, 0.95);

  float t = clamp(xNorm * 0.5 + 0.5, 0.0, 1.0);
  if (t < 0.25) return mix(magenta, violet, t / 0.25);
  if (t < 0.50) return mix(violet, indigo, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(indigo, blue,   (t - 0.50) / 0.25);
  return mix(blue, cyan, (t - 0.75) / 0.25);
}

// Everything inside this ellipse is dimmed hard so the headline and the
// search field stay legible over it.
float readabilityMask(vec2 ndc) {
  float d = length((ndc - vec2(0.0, 0.10)) / vec2(0.62, 0.40));
  return mix(0.07, 1.0, smoothstep(0.40, 1.15, d));
}
`;

const FIELD_VERT = `
attribute vec2 aGrid;   // x: -1..1 across, y: 0..1 into the distance
attribute float aSeed;  // stable per-point randomness

uniform float uTime;
uniform float uAspect;
uniform float uScroll;   // 0 = frozen (reduced motion), 1 = full speed
uniform float uIsPoint;  // 1.0 for nodes, 0.0 for the mesh

varying vec3 vColor;
varying float vAlpha;

${PROJECTION}

void main() {
  float x = aGrid.x * HALF_W;

  // The wrap that makes the flow endless.
  float z = fract(aGrid.y + uTime * 0.028 * uScroll) * DEPTH;

  float h = waveHeight(vec2(x, z), uTime * uScroll);
  vec2 ndc = project(vec3(x, h * AMP, z), uAspect);
  gl_Position = vec4(ndc, 0.0, 1.0);

  float viewZ = z + NEAR;
  // Nodes are the thing the eye reads as "network"; the mesh is supporting
  // structure. Sized so near nodes are unmistakably points of light rather
  // than just brighter pixels on a line.
  gl_PointSize = uIsPoint * clamp(15.0 / viewZ, 1.0, 4.6);

  float crest = clamp(h * 0.5 + 0.5, 0.0, 1.0);

  vec3 c = fieldColor(aGrid.x);
  // Sparse warm accents, tied to crests so they read as highlights catching
  // the light rather than as scattered confetti.
  float warm = step(0.945, fract(aSeed * 43.31)) * smoothstep(0.55, 0.95, crest);
  vColor = mix(c, vec3(1.00, 0.44, 0.18), warm * 0.85);

  // Depth fade. The far edge reaches zero well before the wrap point, which
  // is what hides the recycling.
  float a = (1.0 - smoothstep(DEPTH * 0.45, DEPTH, z)) * smoothstep(0.0, 4.0, z);

  // Crests catch more light than troughs — this is what gives the surface
  // its sense of volume.
  a *= mix(0.35, 1.0, crest);
  a *= readabilityMask(ndc);

  // The mesh sits behind the nodes so the lines never compete with them.
  a *= mix(0.30, 1.30, uIsPoint);

  vAlpha = a;
}
`;

const FIELD_FRAG = `
precision mediump float;

varying vec3 vColor;
varying float vAlpha;

// Explicitly highp to match the vertex shaders.
//
// A uniform shared between stages must agree on precision or the program
// fails to LINK — and it links silently to nothing, so the canvas just stays
// blank with no console error. The vertex stage defaults float to highp while
// this stage is mediump, so without this qualifier the two disagree.
uniform highp float uIsPoint;

void main() {
  float a = vAlpha;

  // Round the nodes off with a soft core so they glow, instead of showing as
  // the hard squares gl_POINTS gives you by default.
  if (uIsPoint > 0.5) {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    a *= smoothstep(0.5, 0.06, d);
  }

  gl_FragColor = vec4(vColor * a, a);
}
`;

const BEAM_VERT = `
attribute vec2 aAnchor;  // x: -1..1 across, y: 0..1 into the distance
attribute float aT;      // 0 = foot on the wave, 1 = tip

uniform float uTime;
uniform float uAspect;
uniform float uScroll;
uniform float uIsPoint;

varying vec3 vColor;
varying float vAlpha;

${PROJECTION}

void main() {
  float x = aAnchor.x * HALF_W;
  float z = fract(aAnchor.y + uTime * 0.028 * uScroll) * DEPTH;

  float h = waveHeight(vec2(x, z), uTime * uScroll);
  // Beams stand on the surface and rise from it, so they travel with the
  // waves instead of hovering independently.
  float y = h * AMP + aT * 3.1;

  vec2 ndc = project(vec3(x, y, z), uAspect);
  gl_Position = vec4(ndc, 0.0, 1.0);

  float viewZ = z + NEAR;
  gl_PointSize = uIsPoint * clamp(16.0 / viewZ, 1.5, 5.0);

  vColor = fieldColor(aAnchor.x);

  float a = (1.0 - smoothstep(DEPTH * 0.4, DEPTH * 0.9, z)) * smoothstep(0.0, 6.0, z);
  // Brightest at the tip, fading toward the foot — reads as a signal rising
  // out of the field.
  a *= mix(0.10, 0.85, aT);
  a *= readabilityMask(ndc);
  // Tip nodes get a bright bloom; the line stays restrained.
  a *= mix(1.0, 1.7, uIsPoint);

  vAlpha = a;
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("HeroField shader:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("HeroField link:", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

/**
 * The labelled markers from the reference artwork.
 *
 * These are decorative, not page content — they name the kinds of signal the
 * product looks for, as part of the illustration. Rendered as DOM rather than
 * inside the canvas so the type stays crisp at any DPI, and kept out of the
 * accessibility tree along with the rest of the backdrop.
 *
 * Positions are percentages, chosen to sit clear of the headline and search
 * field. They're hidden below `lg` where there simply isn't room beside the
 * copy.
 */
const SIGNAL_MARKERS = [
  { label: "Funding Round", x: "13%", y: "12%", len: 190, tone: "#a855f7" },
  { label: "Product Launch", x: "72%", y: "13%", len: 210, tone: "#38bdf8" },
  { label: "Hiring Signal", x: "9%", y: "52%", len: 150, tone: "#c026d3" },
  { label: "Leadership Change", x: "88%", y: "34%", len: 165, tone: "#fb923c" },
  { label: "Intent Spike", x: "84%", y: "56%", len: 130, tone: "#22d3ee" },
];

function SignalMarkers() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block">
      {SIGNAL_MARKERS.map((m, i) => (
        <div
          key={m.label}
          className="absolute"
          style={{
            left: m.x,
            top: m.y,
            // Staggered so they don't breathe in unison, which would read as
            // a UI pulse rather than as ambient depth.
            animation: `hero-marker 9s ease-in-out ${i * 1.4}s infinite`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: m.tone, boxShadow: `0 0 10px 2px ${m.tone}80` }}
            />
            <span
              className="whitespace-nowrap rounded-md border px-2 py-1 text-[11px] leading-none text-hi/90 backdrop-blur-sm"
              style={{
                borderColor: `${m.tone}55`,
                background: "rgba(12,14,24,0.72)",
              }}
            >
              {m.label}
            </span>
          </div>
          {/* The beam dropping away from the marker, fading as it falls. */}
          <div
            className="absolute left-[3px] top-1.5 w-px"
            style={{
              height: m.len,
              background: `linear-gradient(to bottom, ${m.tone}cc, ${m.tone}00)`,
            }}
          />
        </div>
      ))}

      <style jsx>{`
        @keyframes hero-marker {
          0%,
          100% {
            transform: translateY(0);
            opacity: 0.86;
          }
          50% {
            transform: translateY(-6px);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          div[style*="hero-marker"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export function HeroField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // One attempt, plain attributes.
    //
    // An earlier version asked for `failIfMajorPerformanceCaveat: true` first
    // and retried without it. Two things were wrong with that: browsers can
    // treat an integrated GPU under `powerPreference: "low-power"` as a
    // "caveat" and hand back null on machines that render this perfectly well,
    // and once getContext has failed for a canvas the retry returns null too —
    // so the fallback never fired and the field silently never appeared.
    const gl = (canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      depth: false,
    }) ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

    // No WebGL at all: the CSS gradient underneath stays as the backdrop.
    if (!gl) return;

    const fieldProg = link(gl, FIELD_VERT, FIELD_FRAG);
    const beamProg = link(gl, BEAM_VERT, FIELD_FRAG);
    if (!fieldProg || !beamProg) return;

    // ---- Field geometry -------------------------------------------------
    const gridXY = new Float32Array(COLS * ROWS * 2);
    const gridSeed = new Float32Array(COLS * ROWS);
    let i = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        gridXY[i * 2] = (c / (COLS - 1)) * 2 - 1;
        gridXY[i * 2 + 1] = r / ROWS;
        // Deterministic, so warm accents stay put frame to frame rather than
        // twinkling at random.
        const s = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
        gridSeed[i] = s - Math.floor(s);
        i++;
      }
    }

    // Each point links right and forward, giving the woven mesh.
    const lineIdx: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const n = r * COLS + c;
        if (c < COLS - 1) lineIdx.push(n, n + 1);
        if (r < ROWS - 1) lineIdx.push(n, n + COLS);
      }
    }
    const indices = new Uint16Array(lineIdx);

    // ---- Beam geometry --------------------------------------------------
    const beamXY = new Float32Array(BEAM_COUNT * 2 * 2);
    const beamT = new Float32Array(BEAM_COUNT * 2);
    for (let b = 0; b < BEAM_COUNT; b++) {
      // Pushed toward the sides: the middle of the frame belongs to the copy.
      const side = b % 2 === 0 ? -1 : 1;
      const spread = 0.42 + ((b * 0.137) % 1) * 0.55;
      const ax = side * spread;
      const az = (b * 0.0625 + ((b * 0.31) % 1) * 0.06) % 1;
      for (let v = 0; v < 2; v++) {
        beamXY[(b * 2 + v) * 2] = ax;
        beamXY[(b * 2 + v) * 2 + 1] = az;
        beamT[b * 2 + v] = v;
      }
    }

    // `target` is typed as a plain GLenum: inferring it from the default would
    // narrow it to ARRAY_BUFFER's literal type and reject ELEMENT_ARRAY_BUFFER.
    const buf = (data: BufferSource, target: GLenum = gl.ARRAY_BUFFER) => {
      const b = gl.createBuffer();
      gl.bindBuffer(target, b);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return b;
    };

    const gridXYBuf = buf(gridXY);
    const gridSeedBuf = buf(gridSeed);
    const idxBuf = buf(indices, gl.ELEMENT_ARRAY_BUFFER);
    const beamXYBuf = buf(beamXY);
    const beamTBuf = buf(beamT);

    const bindAttr = (
      program: WebGLProgram,
      name: string,
      buffer: WebGLBuffer | null,
      size: number
    ) => {
      const loc = gl.getAttribLocation(program, name);
      if (loc < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };

    const uniforms = (program: WebGLProgram) => ({
      time: gl.getUniformLocation(program, "uTime"),
      aspect: gl.getUniformLocation(program, "uAspect"),
      scroll: gl.getUniformLocation(program, "uScroll"),
      isPoint: gl.getUniformLocation(program, "uIsPoint"),
    });
    const fieldU = uniforms(fieldProg);
    const beamU = uniforms(beamProg);

    // Additive blending over the dark page is what produces the bloom where
    // lines and nodes overlap.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.DEPTH_TEST);

    // ---- Sizing ---------------------------------------------------------
    let aspect = 1;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // Capping DPR keeps a 4K display from rendering four times the pixels
      // for a background nobody inspects closely.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      aspect = rect.width / rect.height;
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motionQuery.matches;

    let raf = 0;
    let running = false;
    const start = performance.now();

    const draw = (t: number) => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      const scroll = reduced ? 0 : 1;

      // --- field: mesh, then nodes on top ---
      gl.useProgram(fieldProg);
      bindAttr(fieldProg, "aGrid", gridXYBuf, 2);
      bindAttr(fieldProg, "aSeed", gridSeedBuf, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.uniform1f(fieldU.time, t);
      gl.uniform1f(fieldU.aspect, aspect);
      gl.uniform1f(fieldU.scroll, scroll);

      gl.uniform1f(fieldU.isPoint, 0);
      gl.drawElements(gl.LINES, indices.length, gl.UNSIGNED_SHORT, 0);

      gl.uniform1f(fieldU.isPoint, 1);
      gl.drawArrays(gl.POINTS, 0, COLS * ROWS);

      // --- vertical signal beams ---
      gl.useProgram(beamProg);
      bindAttr(beamProg, "aAnchor", beamXYBuf, 2);
      bindAttr(beamProg, "aT", beamTBuf, 1);
      gl.uniform1f(beamU.time, t);
      gl.uniform1f(beamU.aspect, aspect);
      gl.uniform1f(beamU.scroll, scroll);

      gl.uniform1f(beamU.isPoint, 0);
      gl.drawArrays(gl.LINES, 0, BEAM_COUNT * 2);

      gl.uniform1f(beamU.isPoint, 1);
      gl.drawArrays(gl.POINTS, 0, BEAM_COUNT * 2);
    };

    const frame = (now: number) => {
      draw((now - start) / 1000);
      raf = requestAnimationFrame(frame);
    };

    const play = () => {
      if (running || reduced) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };

    const pause = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // Reduced motion still gets the artwork — just held still rather than
    // removed, so the page keeps its depth without anything moving.
    if (reduced) draw(12);
    else play();

    const onMotionChange = () => {
      reduced = motionQuery.matches;
      if (reduced) {
        pause();
        draw(12);
      } else {
        play();
      }
    };
    motionQuery.addEventListener("change", onMotionChange);

    // Don't burn a GPU on a tab nobody is looking at, or on a field that's
    // been scrolled past.
    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVisibility);

    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting && !document.hidden ? play() : pause()),
      // Generous margin so a borderline first measurement can't pause the
      // field before it has ever drawn a frame.
      { threshold: 0, rootMargin: "300px" }
    );
    io.observe(canvas);

    return () => {
      pause();
      observer.disconnect();
      io.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibility);
      [gridXYBuf, gridSeedBuf, idxBuf, beamXYBuf, beamTBuf].forEach((b) =>
        gl.deleteBuffer(b)
      );
      gl.deleteProgram(fieldProg);
      gl.deleteProgram(beamProg);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[min(1100px,190vh)] overflow-hidden"
      style={{
        // Fade the field out before it reaches the content below the hero, so
        // there's no hard edge where it stops.
        maskImage:
          "linear-gradient(to bottom, black 0%, black 58%, transparent 96%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, black 0%, black 58%, transparent 96%)",
      }}
    >
      {/*
        Static fallback. Sits behind the canvas and shows through wherever the
        field is sparse — and carries the hero on its own if WebGL is
        unavailable, so the section never collapses to flat black.
      */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 60% at 8% 62%, rgba(150,45,190,0.20), transparent 62%)," +
            "radial-gradient(85% 58% at 92% 58%, rgba(40,130,235,0.20), transparent 62%)," +
            "radial-gradient(60% 45% at 50% 40%, rgba(10,12,19,0.85), transparent 70%)",
        }}
      />
      <canvas ref={canvasRef} className="relative block w-full h-full" />
      <SignalMarkers />
    </div>
  );
}
