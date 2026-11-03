"use client";

import { useEffect, useRef } from "react";

import { globeCircle, useMapInstance } from "@/components/map/map-instance";
import { useSituation } from "@/stores/situation";

/**
 * Atlas, rendered as live ASCII, holding the real globe on his shoulders.
 * The statue image's sphere is aligned to the Mapbox globe every frame; glyphs inside the
 * globe's disc are discarded so the planet sits in front of him.
 */

const IMAGE = "/art/atlas.webp";
// Where the marble sphere sits in the source image (fractions of width / height).
const SPHERE = { x: 0.49, y: 0.183, r: 0.236 };
// Dark to bright. Space first so empty marble reads as void.
const RAMP = " .,:;-=+*xo%#@";
const CELL = { w: 7, h: 11 };

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform sampler2D uAtlas;
uniform vec2 uRes;
uniform vec2 uCell;
uniform vec4 uImgRect;
uniform vec3 uGlobe;
uniform vec2 uMouse;
uniform float uTime;
uniform float uReveal;
uniform float uOpacity;
uniform float uGlyphs;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(p / uCell);
  vec2 local = (p - cell * uCell) / uCell;
  vec2 center = (cell + 0.5) * uCell;

  // The planet is in front of Atlas: nothing draws inside its disc.
  float dGlobe = distance(center, uGlobe.xy);
  if (dGlobe < uGlobe.z * 0.995) discard;

  vec2 uv = (center - uImgRect.xy) / uImgRect.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;

  vec3 src = texture(uImage, uv).rgb;
  float lum = dot(src, vec3(0.299, 0.587, 0.114));
  lum = smoothstep(0.06, 0.92, lum);
  // Fade the bottom of the figure into space.
  lum *= smoothstep(1.0, 0.62, uv.y);

  float t = uTime;
  float mouse = smoothstep(150.0, 0.0, distance(center, uMouse));
  float band = exp(-pow((center.y / uRes.y - fract(t * 0.045) * 1.4 + 0.2) * 9.0, 2.0));
  float rim = smoothstep(uGlobe.z * 1.12, uGlobe.z, dGlobe);

  float level = clamp(lum + band * 0.12 * lum + mouse * 0.25 * lum, 0.0, 1.0);
  float idx = floor(level * (uGlyphs - 1.0) + 0.5);

  float h = hash(cell + floor(t * 7.0));
  if (lum > 0.08 && (h > 0.992 || mouse * h > 0.55 || band * h > 0.93)) {
    idx = floor(hash(cell + floor(t * 24.0)) * (uGlyphs - 1.0)) + 1.0;
  }

  // Cells decode in at random during the reveal.
  float reveal = step(hash(cell * 1.731), uReveal);
  if (reveal < 0.5 && lum > 0.05 && hash(cell + floor(t * 30.0)) > 0.6) {
    idx = floor(hash(cell + floor(t * 30.0) + 3.1) * (uGlyphs - 1.0)) + 1.0;
    reveal = 0.35;
  }

  float a = texture(uAtlas, vec2((idx + local.x) / uGlyphs, local.y)).a;
  vec3 ink = mix(vec3(0.62, 0.66, 0.72), vec3(0.96, 0.94, 0.91), level);
  ink = mix(ink, vec3(0.55, 0.75, 1.0), rim * 0.35);
  // The marble sphere overhang is a halo, kept quieter than the figure so the planet stays the subject.
  float halo = 1.0 - rim * 0.45;
  float alpha = a * reveal * uOpacity * halo * (0.12 + 0.6 * level + band * 0.22 + mouse * 0.4);
  outColor = vec4(ink * alpha, alpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
  return shader;
}

function glyphAtlas(dpr: number): HTMLCanvasElement {
  const w = Math.round(CELL.w * dpr);
  const h = Math.round(CELL.h * dpr);
  const canvas = document.createElement("canvas");
  canvas.width = w * RAMP.length;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono") || "monospace";
  ctx.font = `500 ${Math.round(h * 0.86)}px ${family}, ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  [...RAMP].forEach((ch, i) => ctx.fillText(ch, i * w + w / 2, h / 2 + dpr * 0.5));
  return canvas;
}

export function AsciiAtlas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const map = useMapInstance((s) => s.map);
  const ready = useMapInstance((s) => s.ready);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !map || !ready) return;
    // Activity preserves React's DOM on navigation. Own a fresh canvas for each effect so a
    // context released during cleanup is never reused when the route becomes visible again.
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 h-full w-full";
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(window.location.search).has("still");

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
    } catch (error) {
      console.warn("Atlas shader unavailable", error);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return;
    }
    gl.useProgram(program);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uni = {
      res: u("uRes"),
      cell: u("uCell"),
      rect: u("uImgRect"),
      globe: u("uGlobe"),
      mouse: u("uMouse"),
      time: u("uTime"),
      reveal: u("uReveal"),
      opacity: u("uOpacity"),
      glyphs: u("uGlyphs"),
      image: u("uImage"),
      atlas: u("uAtlas"),
    };

    const texture = (unit: number, source: TexImageSource, filter: number) => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      return tex;
    };

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let disposed = false;
    let imageReady = false;
    const image = new Image();
    image.decoding = "async";
    image.src = IMAGE;
    image.onload = () => {
      texture(0, image, gl.LINEAR);
      imageReady = true;
    };
    void document.fonts.ready.then(() => {
      if (!disposed) texture(1, glyphAtlas(dpr), gl.NEAREST);
    });
    texture(1, glyphAtlas(dpr), gl.NEAREST);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const mouse = { x: -9999, y: -9999 };
    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    container.appendChild(canvas);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    let opacity = 0;
    let frame = 0;
    const start = performance.now();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || !imageReady) return;
      const state = useSituation.getState();
      const zoom = map.getZoom();
      const pitch = map.getPitch();
      const show = !state.cinema && zoom < 2.35 && pitch < 10;
      opacity += ((show ? 1 : 0) - opacity) * 0.08;
      if (opacity < 0.01 && !show) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }
      const globe = globeCircle(map);
      // Scale the statue so its marble sphere is slightly larger than the planet: the overhang is the halo.
      const width = (globe.r * 1.07) / SPHERE.r;
      const height = width * (image.naturalHeight / image.naturalWidth);
      const left = globe.x - SPHERE.x * width;
      const top = globe.y - SPHERE.y * height;
      const elapsed = (now - start) / 1000;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uni.res, canvas.width, canvas.height);
      gl.uniform2f(uni.cell, CELL.w * dpr, CELL.h * dpr);
      gl.uniform4f(uni.rect, left * dpr, top * dpr, width * dpr, height * dpr);
      gl.uniform3f(uni.globe, globe.x * dpr, globe.y * dpr, globe.r * dpr);
      gl.uniform2f(uni.mouse, mouse.x * dpr, mouse.y * dpr);
      gl.uniform1f(uni.time, reduced ? 0 : elapsed);
      gl.uniform1f(uni.reveal, reduced ? 1 : Math.min(1, elapsed / 2.4));
      gl.uniform1f(uni.opacity, opacity);
      gl.uniform1f(uni.glyphs, RAMP.length);
      gl.uniform1i(uni.image, 0);
      gl.uniform1i(uni.atlas, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      image.onload = null;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [map, ready]);

  return <div ref={containerRef} className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden />;
}
