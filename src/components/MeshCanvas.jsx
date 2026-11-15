import React, { useEffect, useRef } from 'react';

export const MeshCanvas = ({
  className = '',
  speed = 0.25,
  grainIntensity = 0,
}) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = initCobaltMeshGradient(canvas, {
      speed,
      grainIntensity,
    });

    return () => {
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

function initCobaltMeshGradient(canvas, options) {
  const gl =
    canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    }) || canvas.getContext('experimental-webgl');

  if (!gl) {
    console.warn('WebGL is not available on this device');
    return () => {};
  }

  const vertexShaderSource = `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = (position + 1.0) * 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uGrain;

    const vec3 cWhite   = vec3(0.961, 0.980, 0.980);
    const vec3 cCobalt  = vec3(0.000, 0.333, 1.000);
    const vec3 cOrange  = vec3(1.000, 0.380, 0.012);

    float hash21(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.23);
      return fract(p.x * p.y);
    }

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

      vec2 warp1 = vec2(
        snoise(uv * 1.3 + vec2(t * 0.20, t * 0.14)),
        snoise(uv * 1.3 + vec2(-t * 0.16, t * 0.22))
      );
      vec2 warp2 = vec2(
        snoise(uv * 2.6 + warp1 * 0.5 + vec2(t * 0.10, -t * 0.12)),
        snoise(uv * 2.6 + warp1 * 0.5 + vec2(-t * 0.12, t * 0.14))
      );
      vec2 warpedUV = uv + (warp1 * 0.24 + warp2 * 0.12);

      vec2 pWhite1  = vec2(0.28 * aspect + 0.26 * sin(t * 0.24),       0.32 + 0.24 * cos(t * 0.27));
      vec2 pWhite2  = vec2(0.74 * aspect + 0.28 * cos(t * 0.29 + 1.4), 0.72 + 0.24 * sin(t * 0.25));

      vec2 pCobalt1 = vec2(0.70 * aspect + 0.28 * cos(t * 0.26 + 0.6), 0.30 + 0.25 * sin(t * 0.28 + 1.8));
      vec2 pCobalt2 = vec2(0.26 * aspect + 0.26 * sin(t * 0.31 + 2.5), 0.70 + 0.25 * cos(t * 0.24 + 0.9));

      vec2 pOrange  = vec2(0.52 * aspect + 0.34 * cos(t * 0.38 + 2.2), 0.48 + 0.28 * sin(t * 0.34 + 0.9));

      float dWhite1  = length(warpedUV - pWhite1);
      float dWhite2  = length(warpedUV - pWhite2);
      float dCobalt1 = length(warpedUV - pCobalt1);
      float dCobalt2 = length(warpedUV - pCobalt2);
      float dOrange  = length(warpedUV - pOrange);

      float wWhite  = (1.0 / (pow(dWhite1,  1.9) * 2.3 + 0.08) + 1.0 / (pow(dWhite2,  1.9) * 2.3 + 0.08)) * 1.50;
      float wCobalt = (1.0 / (pow(dCobalt1, 1.9) * 2.3 + 0.08) + 1.0 / (pow(dCobalt2, 1.9) * 2.3 + 0.08)) * 1.50;
      float wOrange = (1.0 / (pow(dOrange,  2.2) * 3.4 + 0.09)) * 1.10;

      float totalW = wWhite + wCobalt + wOrange;
      vec3 col = (wWhite * cWhite + wCobalt * cCobalt + wOrange * cOrange) / totalW;

      if (uGrain > 0.001) {
        float orangeRatio = clamp(wOrange / totalW, 0.0, 1.0);
        float grainMask = 1.0 - smoothstep(0.10, 0.48, orangeRatio);
        float grain = (hash21(gl_FragCoord.xy + fract(uTime * 4.0)) - 0.5) * uGrain * grainMask;
        col += grain;
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  function createShader(shaderType, sourceCode) {
    const shader = gl.createShader(shaderType);
    if (!shader) return null;
    gl.shaderSource(shader, sourceCode);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!vertexShader || !fragmentShader) return () => {};

  const program = gl.createProgram();
  if (!program) return () => {};
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program linking failed:', gl.getProgramInfoLog(program));
    return () => {};
  }

  gl.useProgram(program);

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
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
    gl.STATIC_DRAW,
  );

  const positionLocation = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const timeLocation = gl.getUniformLocation(program, 'uTime');
  const resolutionLocation = gl.getUniformLocation(program, 'uResolution');
  const grainLocation = gl.getUniformLocation(program, 'uGrain');

  function handleResize() {
    // Cap pixel ratio at 1.25 to keep fragment shading responsive on high-DPI displays
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    const scaledWidth = Math.floor(canvas.clientWidth * devicePixelRatio);
    const scaledHeight = Math.floor(canvas.clientHeight * devicePixelRatio);
    if (
      scaledWidth > 0 &&
      scaledHeight > 0 &&
      (canvas.width !== scaledWidth || canvas.height !== scaledHeight)
    ) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
  }

  handleResize();
  window.addEventListener('resize', handleResize, { passive: true });

  let isRunning = true;
  let animationFrameId = null;
  const startTimeMs = performance.now();
  let pausedDurationMs = 0;
  let pausedAtMs = 0;

  const handleVisibilityChange = () => {
    if (document.hidden) {
      if (isRunning) {
        isRunning = false;
        pausedAtMs = performance.now();
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }
    } else if (!isRunning) {
      isRunning = true;
      if (pausedAtMs > 0) {
        pausedDurationMs += performance.now() - pausedAtMs;
      }
      animationFrameId = requestAnimationFrame(renderFrame);
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  function renderFrame(currentTimeMs) {
    if (!isRunning || !gl) return;

    handleResize();

    const elapsedSeconds = (currentTimeMs - startTimeMs - pausedDurationMs) * 0.001 * options.speed;

    gl.useProgram(program);
    gl.uniform1f(timeLocation, elapsedSeconds);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(grainLocation, options.grainIntensity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    animationFrameId = requestAnimationFrame(renderFrame);
  }

  animationFrameId = requestAnimationFrame(renderFrame);

  return () => {
    isRunning = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
    window.removeEventListener('resize', handleResize);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (gl) {
      gl.deleteBuffer(vertexBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    }
  };
}
