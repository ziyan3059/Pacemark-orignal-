import React, { useEffect, useRef } from 'react';

interface MeshCanvasProps {
  className?: string;
  speed?: number;
  grainIntensity?: number;
}

export const MeshCanvas: React.FC<MeshCanvasProps> = ({
  className = '',
  speed = 0.25,
  grainIntensity = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;
    let cleanup: (() => void) | null = null;

    cleanup = initCobaltMeshGradient(canvas, {
      speed,
      grainIntensity,
    });

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [speed, grainIntensity]);

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full h-full pointer-events-none ${className}`}
      style={{ touchAction: 'none' }}
    />
  );
};

interface ShaderOptions {
  speed: number;
  grainIntensity: number;
}

function initCobaltMeshGradient(
  canvas: HTMLCanvasElement,
  options: ShaderOptions
): () => void {
  const gl =
    canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    }) ||
    (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

  if (!gl) {
    console.warn('WebGL is not available on this device');
    return () => {};
  }

  const vertSrc = `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = (position + 1.0) * 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  // GPU Fragment Shader: Pure luminous palette (NO dark/black tones), +30% cobalt presence, soft silk grain
  const fragSrc = `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uGrain;

    // Palette Colors (Zero black / dark tones):
    // 1. Ice White (#F5FAFA) - Dominant base field
    const vec3 cWhite   = vec3(0.961, 0.980, 0.980);
    // 2. Electric Royal Cobalt (#0055FF) - Boosted vibrance & +30% color presence
    const vec3 cCobalt  = vec3(0.000, 0.333, 1.000);
    // 3. Bright Pop Orange (#FF6103) - Energetic accent
    const vec3 cOrange  = vec3(1.000, 0.380, 0.012);

    // Fast 2D pseudo-random hash for soft silk grain texture
    float hash21(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.23);
      return fract(p.x * p.y);
    }

    // Smooth gradient noise for watercolor domain warping
    vec2 hash22(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
    }

    float snoise(in vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                     dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                 mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                     dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
    }

    void main() {
      vec2 st = gl_FragCoord.xy / uResolution.xy;
      float aspect = uResolution.x / uResolution.y;
      vec2 uv = st;
      uv.x *= aspect;

      float t = uTime;

      // Multi-frequency watercolor domain warping
      vec2 warp1 = vec2(
        snoise(uv * 1.3 + vec2(t * 0.20, t * 0.14)),
        snoise(uv * 1.3 + vec2(-t * 0.16, t * 0.22))
      );
      vec2 warp2 = vec2(
        snoise(uv * 2.6 + warp1 * 0.5 + vec2(t * 0.10, -t * 0.12)),
        snoise(uv * 2.6 + warp1 * 0.5 + vec2(-t * 0.12, t * 0.14))
      );
      vec2 warpedUV = uv + (warp1 * 0.24 + warp2 * 0.12);

      // Color nodes moving along organic Lissajous paths
      // Balanced 50:50 White & Electric Royal Cobalt field anchors
      vec2 pWhite1  = vec2(0.28 * aspect + 0.26 * sin(t * 0.24),       0.32 + 0.24 * cos(t * 0.27));
      vec2 pWhite2  = vec2(0.74 * aspect + 0.28 * cos(t * 0.29 + 1.4), 0.72 + 0.24 * sin(t * 0.25));

      vec2 pCobalt1 = vec2(0.70 * aspect + 0.28 * cos(t * 0.26 + 0.6), 0.30 + 0.25 * sin(t * 0.28 + 1.8));
      vec2 pCobalt2 = vec2(0.26 * aspect + 0.26 * sin(t * 0.31 + 2.5), 0.70 + 0.25 * cos(t * 0.24 + 0.9));

      // Pop Orange (#FF6103) - energetic luminous accent
      vec2 pOrange  = vec2(0.52 * aspect + 0.34 * cos(t * 0.38 + 2.2), 0.48 + 0.28 * sin(t * 0.34 + 0.9));

      // Distance falloff calculations
      float dWhite1  = length(warpedUV - pWhite1);
      float dWhite2  = length(warpedUV - pWhite2);
      float dCobalt1 = length(warpedUV - pCobalt1);
      float dCobalt2 = length(warpedUV - pCobalt2);
      float dOrange  = length(warpedUV - pOrange);

      // Equal 50:50 weight distribution between White and Electric Royal Cobalt with crisp watercolor folds
      float wWhite  = (1.0 / (pow(dWhite1,  1.9) * 2.3 + 0.08) + 1.0 / (pow(dWhite2,  1.9) * 2.3 + 0.08)) * 1.50;
      float wCobalt = (1.0 / (pow(dCobalt1, 1.9) * 2.3 + 0.08) + 1.0 / (pow(dCobalt2, 1.9) * 2.3 + 0.08)) * 1.50;
      float wOrange = (1.0 / (pow(dOrange,  2.2) * 3.4 + 0.09)) * 1.10;

      float totalW = wWhite + wCobalt + wOrange;
      vec3 col = (wWhite * cWhite + wCobalt * cCobalt + wOrange * cOrange) / totalW;

      // Soft silk fine grain texture overlay that subtly fades out into the moving orange center
      if (uGrain > 0.001) {
        float orangeRatio = clamp(wOrange / totalW, 0.0, 1.0);
        float grainMask = 1.0 - smoothstep(0.10, 0.48, orangeRatio);
        float grain = (hash21(gl_FragCoord.xy + fract(uTime * 4.0)) - 0.5) * uGrain * grainMask;
        col += grain;
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  function createShader(type: number, src: string) {
    const s = gl!.createShader(type);
    if (!s) return null;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      console.error('Shader compilation failed:', gl!.getShaderInfoLog(s));
      gl!.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = createShader(gl.VERTEX_SHADER, vertSrc);
  const fs = createShader(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return () => {};

  const prog = gl.createProgram();
  if (!prog) return () => {};
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program linking failed:', gl.getProgramInfoLog(prog));
    return () => {};
  }

  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]),
    gl.STATIC_DRAW
  );

  const posLoc = gl.getAttribLocation(prog, 'position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uTimeLoc = gl.getUniformLocation(prog, 'uTime');
  const uResLoc = gl.getUniformLocation(prog, 'uResolution');
  const uGrainLoc = gl.getUniformLocation(prog, 'uGrain');

  // CPU Optimization 1: DPR clamped to 1.25x
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
      gl!.viewport(0, 0, canvas.width, canvas.height);
    }
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  let isRunning = true;
  let rafId: number | null = null;
  const startTime = performance.now();
  let pausedElapsed = 0;
  let lastPauseTime = 0;

  // CPU Optimization 2: Auto-pause on inactive tab
  const handleVisibility = () => {
    if (document.hidden) {
      if (isRunning) {
        isRunning = false;
        lastPauseTime = performance.now();
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }
    } else {
      if (!isRunning) {
        isRunning = true;
        if (lastPauseTime > 0) {
          pausedElapsed += performance.now() - lastPauseTime;
        }
        rafId = requestAnimationFrame(loop);
      }
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  function loop(now: number) {
    if (!isRunning || !gl) return;

    resize();

    const elapsedSeconds = (now - startTime - pausedElapsed) * 0.001 * options.speed;

    gl.useProgram(prog);
    gl.uniform1f(uTimeLoc, elapsedSeconds);
    gl.uniform2f(uResLoc, canvas.width, canvas.height);
    gl.uniform1f(uGrainLoc, options.grainIntensity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);

  return () => {
    isRunning = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', handleVisibility);
    if (gl) {
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    }
  };
}
