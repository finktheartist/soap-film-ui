// ============================================================================
// SOAP FILM · ROTARY SOAP DIAL (SPINNING NAVIER-STOKES VORTEX KNOB)
// ============================================================================
// A minimal circular volume/level dial encased in a live 3D iridescent soap
// dome backed by an 80x80 circular-domain 2D Navier-Stokes fluid solver.
// Rotating the dial injects azimuthal shear and trailing wake eddies into the
// thin-film thickness field, twisting interference colors into real swirling
// Marangoni spirals that shear into counter-rotating vortices on reversal and
// lazily unwind after release.

const VERT_SRC = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSim;       // R: advected vortex thickness, G: z-wave, B: shimmer
uniform vec2 uRes;
uniform vec2 uSize;
uniform float uTime;

// Dial main dome: (cx, cy, rNdc, wobAmp)
uniform vec4 uDial;
// Dial state: (wobPhase, angleNdc, spinSpeed 0..1, swirlPhase)
uniform vec4 uDialMeta;
// Orbiting soap indicator bead: (bx, by, brNdc, hoverDrag 0..1)
uniform vec4 uBead;

float smin(float a, float b, float k) {
  float kk = max(k, 0.0005);
  float h = clamp(0.5 + 0.5 * (b - a) / kk, 0.0, 1.0);
  return mix(b, a, h) - kk * h * (1.0 - h);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// High-chroma stylized-physical thin-film interference spectrum (Soap Film family)
vec3 bubbleIridescence(float dNm, float cosTheta) {
  float nFilm = 1.333;
  float opd = 2.0 * nFilm * dNm * cosTheta;

  const float WL[6] = float[6](645.0, 595.0, 545.0, 500.0, 465.0, 430.0);
  const vec3 WRGB[6] = vec3[6](
    vec3(0.76, 0.06, 0.00),
    vec3(0.48, 0.36, 0.00),
    vec3(0.10, 0.56, 0.06),
    vec3(0.00, 0.44, 0.34),
    vec3(0.02, 0.14, 0.68),
    vec3(0.28, 0.02, 0.58)
  );

  vec3 col = vec3(0.0);
  float coh = exp(-max(0.0, dNm - 160.0) * 0.00040);
  for (int i = 0; i < 6; i++) {
    float phase = 6.2831853 * opd / WL[i];
    float s = sin(phase * 0.5);
    float r = mix(0.5, s * s, coh);
    col += WRGB[i] * r;
  }
  col *= vec3(1.14, 1.05, 1.18);
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.62);
  col = pow(clamp(col, 1e-4, 1.25), vec3(0.92));

  float newton = smoothstep(14.0, 62.0, dNm);
  return clamp(col * newton, 0.0, 1.25);
}

vec4 over(vec4 src, vec4 dst) {
  return vec4(src.rgb + dst.rgb * (1.0 - src.a), src.a + dst.a * (1.0 - src.a));
}

float sdDialSoap(vec2 p, out float outBeadMix) {
  vec2 dp = p - uDial.xy;
  float r = max(0.05, uDial.z);
  float ang = atan(dp.y, dp.x);
  float ph = uDialMeta.x;
  float spin = uDialMeta.z;

  // Living breath + spin-excited capillary harmonic ripples on the rim!
  float wob = uDial.w * (0.65 * cos(2.0 * ang + ph) + 0.35 * sin(3.0 * ang - ph * 1.35)) * r;
  float spinRipple = spin * 0.0085 * sin(4.0 * ang - uDialMeta.w * 2.2) * r;
  float breath = 0.0022 * sin(2.0 * ang + uTime * 2.0) * r;
  float dDome = length(dp) - r - wob - spinRipple - breath;

  // Orbiting 3D soap indicator bead fused cleanly into the dial's outer rim via subtle liquid meniscus collar!
  vec2 bp = p - uBead.xy;
  float dBead = length(bp) - max(0.01, uBead.z);
  float kCollar = 0.048 + uBead.w * 0.014;
  float dTotal = smin(dDome, dBead, kCollar);
  outBeadMix = smoothstep(0.032, -0.015, dBead - dDome);
  return dTotal;
}

void main() {
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2((vUv.x * 2.0 - 1.0) * aspect, (vUv.y * 2.0 - 1.0));
  float px = 2.0 / uSize.y;

  vec4 outCol = vec4(0.0);

  if (length(p - uDial.xy) < uDial.z + 0.34) {
    float beadMix;
    float sd = sdDialSoap(p, beadMix);

    // --- 1. SOFT FLOATING GROUND SHADOW BENEATH DIAL DOME ---
    {
      vec2 shPos = uDial.xy + vec2(0.018, -0.058);
      float rSh = uDial.z * 1.18;
      float dSh = length(p - shPos);
      float sh = smoothstep(rSh * 1.28, uDial.z * 0.35, dSh) * 0.052;
      if (sh > 0.001) {
        outCol = over(vec4(vec3(0.24, 0.26, 0.44) * sh, sh), outCol);
      }
    }

    // --- 2. 3D VOLUMETRIC SPINNING NAVIER-STOKES SOAP DIAL DOME + RIM BEAD ---
    float mask = smoothstep(px * 1.65, -px * 1.65, sd);
    if (mask > 0.001) {
      float eps = 0.0038;
      float bmTmp;
      vec2 rawGrad = vec2(
        sdDialSoap(p + vec2(eps, 0.0), bmTmp) - sdDialSoap(p - vec2(eps, 0.0), bmTmp),
        sdDialSoap(p + vec2(0.0, eps), bmTmp) - sdDialSoap(p - vec2(0.0, eps), bmTmp)
      ) / (2.0 * eps);
      vec2 gSmooth = rawGrad / sqrt(dot(rawGrad, rawGrad) + 0.025);

      vec2 dp = p - uDial.xy;
      float rNorm = clamp(length(dp) / max(0.05, uDial.z), 0.0, 1.35);
      float dIn = max(0.0, -sd);
      float scaleSafe = mix(uDial.z, max(0.032, uBead.z), beadMix * 0.85);
      float normDepth = clamp(dIn / max(0.02, scaleSafe), 0.0, 1.0);
      float rho = 1.0 - normDepth;

      // Sample 80x80 circular-domain 2D Navier-Stokes vortex fluid!
      vec2 simUv = clamp((dp / (uDial.z * 2.15)) + 0.5, 0.004, 0.996);
      vec2 texel = 1.0 / vec2(textureSize(uSim, 0));
      vec4 simC = texture(uSim, simUv);
      float zL = texture(uSim, simUv - vec2(texel.x, 0.0)).g;
      float zR = texture(uSim, simUv + vec2(texel.x, 0.0)).g;
      float zD = texture(uSim, simUv - vec2(0.0, texel.y)).g;
      float zU = texture(uSim, simUv + vec2(0.0, texel.y)).g;
      // Preserve razor clarity right over central numeric readout, unleash dramatic vortex ripples across outer ring!
      float vortexAperture = smoothstep(0.22, 0.58, max(rNorm, beadMix));
      vec2 gradZ = vec2(zR - zL, zU - zD) * 6.4 * (0.20 + 0.80 * vortexAperture);

      // Subtle spiral capillary normal modulation driven by Navier-Stokes fluid thickness gradient!
      float tL = texture(uSim, simUv - vec2(texel.x, 0.0)).r;
      float tR = texture(uSim, simUv + vec2(texel.x, 0.0)).r;
      float tD = texture(uSim, simUv - vec2(0.0, texel.y)).r;
      float tU = texture(uSim, simUv + vec2(0.0, texel.y)).r;
      vec2 gradT = vec2(tR - tL, tU - tD) * (0.65 + 1.15 * uDialMeta.z) * vortexAperture;

      // Smooth pillow dome profile (gently curved across outer vortex band, glassy flat center)
      float domeSteep = pow(clamp(rho, 1e-4, 0.995), mix(1.45, 1.02, beadMix)) * 0.92;
      vec2 nXY = gSmooth * domeSteep + gradT - gradZ;
      float nXY2 = dot(nXY, nXY);
      vec3 N = normalize(vec3(nXY, sqrt(max(0.06, 1.0 - min(0.94, nXY2)))));
      vec3 V = vec3(0.0, 0.0, 1.0);
      float NdotV = clamp(dot(N, V), 0.06, 1.0);
      float slopeMag = length(gradZ) + length(gradT) * 0.85;

      float fres = pow(max(1e-4, 1.0 - NdotV), 2.10);
      float razorRim = pow(max(1e-4, 1.0 - NdotV), 4.8);

      // Resolution-adaptive crisp optical rim contour along dial AND fused indicator bead
      float rimOff = max(0.028, min(0.16, px * 1.30 / max(0.02, scaleSafe)));
      float ioArg = (normDepth - rimOff) / max(0.022, rimOff * 0.72);
      float innerOutline = exp(-(ioArg * ioArg));
      float hairOff = min(0.028, px * 0.52 / max(0.02, scaleSafe));
      float owArg = (normDepth - hairOff) / max(0.016, px * 0.55 / max(0.02, scaleSafe));
      float outerWhiteHair = exp(-(owArg * owArg));

      // SWIRLING NAVIER-STOKES THIN-FILM INTERFERENCE!
      // simC.r carries genuine advected spiral streaks & counter-rotating shear curls!
      float ang = atan(dp.y, dp.x);
      float spiralHarmonic = 0.5 + 0.5 * sin(ang * 2.0 - rNorm * 5.8 + uDialMeta.w * 0.85 + simC.r * 5.4);
      float dNmVortex = mix(135.0, 820.0, simC.r * 0.78 + spiralHarmonic * 0.22);
      float dNm = dNmVortex + fres * 245.0 + beadMix * 95.0;

      float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
      float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
      vec3 irid = bubbleIridescence(dNm, cosTheta);

      // Crisp curved Venetian-glass studio specular crescents + twinkling diamond starburst
      vec3 L1 = normalize(vec3(-0.56, 0.78, 0.48));
      vec3 H1 = normalize(L1 + V);
      float ndh1 = max(0.0, dot(N, H1));
      float arc1 = smoothstep(0.91, 0.965, ndh1) * 0.62 + smoothstep(0.974, 0.994, ndh1) * 0.92;

      vec3 L2 = normalize(vec3(0.68, -0.56, 0.44));
      vec3 H2 = normalize(L2 + V);
      float ndh2 = max(0.0, dot(N, H2));
      float arc2 = smoothstep(0.91, 0.97, ndh2) * 0.44;

      vec2 pNorm = dp / max(0.05, uDial.z);
      float skyArc = smoothstep(0.22, 0.90, -pNorm.x * 0.55 + pNorm.y * 0.85) * smoothstep(0.16, 0.80, 1.0 - NdotV) * 0.26;

      vec2 starCenter = vec2(-0.50, 0.56);
      vec2 dStar = (pNorm - starCenter) * 3.8;
      float rStar = length(dStar);
      float rayH = exp(-abs(dStar.y) * 26.0) * exp(-abs(dStar.x) * 4.0);
      float rayV = exp(-abs(dStar.x) * 26.0) * exp(-abs(dStar.y) * 4.0);
      vec2 dDiag = vec2(dStar.x + dStar.y, dStar.x - dStar.y) * 0.7071;
      float rayD = (exp(-abs(dDiag.y) * 34.0) * exp(-abs(dDiag.x) * 7.0)
                  + exp(-abs(dDiag.x) * 34.0) * exp(-abs(dDiag.y) * 7.0)) * 0.50;
      float coreDot = exp(-rStar * rStar * 22.0);
      float twinkle = 0.82 + 0.18 * sin(uTime * (4.6 + uDialMeta.z * 6.0));
      float starburst = (coreDot * 0.95 + (rayH + rayV + rayD) * smoothstep(0.80, 0.0, rStar) * 0.85)
                      * twinkle * smoothstep(0.35, 0.80, ndh1 + 0.20) * (0.65 + 0.45 * uDialMeta.z);

      float specArc = clamp(arc1 + arc2 + skyArc + starburst, 0.0, 1.50) * (0.20 + 0.80 * vortexAperture);

      // Swirling sparkle specks advected through the Marangoni vortex!
      vec2 spGrid = (dp + vec2(simC.r * 0.34, -simC.g * 0.26)) * 22.0;
      vec2 spCell = floor(spGrid);
      vec2 spF = fract(spGrid) - 0.5;
      float spRnd = hash21(spCell);
      float spDot = smoothstep(0.15, 0.02, length(spF)) * step(0.942 - uDialMeta.z * 0.032, spRnd)
                  * (0.45 + 0.55 * sin(uTime * 6.5 + spRnd * 40.0))
                  * (0.28 + 0.65 * fres + simC.b * 0.8) * vortexAperture;

      // Rich swirling iridescent vortex band across mid-to-outer dome!
      float vortexRibbon = vortexAperture * (0.28 + 0.32 * uDialMeta.z + 0.38 * smoothstep(0.18, 0.85, abs(simC.r - 0.5) * 2.0));
      vec3 contourCol = mix(vec3(0.36, 0.40, 0.66), irid * 0.66 + vec3(0.18, 0.16, 0.36), 0.52);
      vec3 domeColor = mix(vec3(0.95, 0.97, 1.0), irid * 0.96 + vec3(0.13, 0.16, 0.24), 0.92);

      vec3 col = mix(vec3(0.97, 0.98, 1.0), domeColor, clamp(0.08 + fres * 0.82 + vortexRibbon * 0.72 + slopeMag * 0.42 + beadMix * 0.24, 0.0, 1.0));
      col = mix(col, contourCol, clamp(innerOutline * 0.52 + razorRim * 0.46, 0.0, 0.82));
      float crescentBand = smoothstep(0.06, 0.72, max(fres, vortexRibbon * 0.82)) * (1.0 - outerWhiteHair * 0.58);
      col = mix(col, clamp(irid * 1.18 + vec3(0.07, 0.06, 0.12), 0.0, 1.0), crescentBand * (0.58 + 0.24 * vortexAperture));
      col = mix(col, vec3(1.0, 0.998, 1.0), clamp(specArc * 0.92 + outerWhiteHair * 0.84 + spDot * 0.85, 0.0, 0.99));

      float rimAlpha = innerOutline * 0.48 + outerWhiteHair * 0.74 + razorRim * 0.54;
      // Ultra-clear center over bold readout (0.025) blooming into lush iridescent vortex bands across outer 70%!
      float alpha = clamp(
        0.024 + vortexRibbon * (0.34 + 0.16 * uDialMeta.z) + fres * (0.66 + 0.16 * beadMix) + rimAlpha + specArc * 0.82 + slopeMag * 0.30 + spDot * 0.56,
        0.0,
        0.96
      );

      vec4 dialLayer = vec4(col * (alpha * mask), alpha * mask);
      outCol = over(dialLayer, outCol);
    }
  }

  fragColor = outCol;
}
`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile error: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

function createProgram(gl) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

class SoapRotaryDial {
  constructor(container, opts = {}) {
    this.width = opts.width || 640;
    this.height = opts.height || 360;
    this.aspect = this.width / this.height;
    this.dpr = opts.dpr || 2;
    this.audio = opts.audio || null;
    this.label = opts.label || 'VOLUME';
    this.format = opts.format || null;
    this.onChange = opts.onChange || (() => {});

    const scale = Math.min(1.0, (this.width - 40) / 340, (this.height - 40) / 290);
    this.scale = scale;
    this.cx = this.width * 0.5;
    this.cy = this.height * 0.505;
    this.rBaseCss = 86 * scale;
    this.rScaleCss = 113 * scale;
    this.rBeadCss = 13.5 * scale;

    // 270-degree precision arc in CSS screen angles (0 = 3 o'clock, CW positive):
    // Start = +135deg (7:30 o'clock), End = +405deg (4:30 o'clock) -> 270deg clockwise sweep!
    this.angMinCss = (135 * Math.PI) / 180;
    this.angMaxCss = (405 * Math.PI) / 180;
    this.angSpan = this.angMaxCss - this.angMinCss;

    this.wrap = document.createElement('div');
    this.wrap.style.cssText = `position:relative;width:${this.width}px;height:${this.height}px;user-select:none;-webkit-user-select:none;touch-action:none;`;
    container.appendChild(this.wrap);

    this.underCanvas = document.createElement('canvas');
    this.underCanvas.width = this.width * this.dpr;
    this.underCanvas.height = this.height * this.dpr;
    this.underCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    this.wrap.appendChild(this.underCanvas);
    this.underCtx = this.underCanvas.getContext('2d');

    this.glCanvas = document.createElement('canvas');
    this.glCanvas.width = this.width * this.dpr;
    this.glCanvas.height = this.height * this.dpr;
    this.glCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    this.wrap.appendChild(this.glCanvas);

    this._initGL();

    // High-resolution 80x80 circular-domain 2D Navier-Stokes vortex fluid!
    this.nx = 80;
    this.ny = 80;
    const N = this.nx * this.ny;
    this.thick = new Float32Array(N);
    this.thickTmp = new Float32Array(N);
    this.vx = new Float32Array(N);
    this.vy = new Float32Array(N);
    this.vxTmp = new Float32Array(N);
    this.vyTmp = new Float32Array(N);
    this.div = new Float32Array(N);
    this.press = new Float32Array(N);
    this.pressTmp = new Float32Array(N);
    this.curl = new Float32Array(N);
    this.z = new Float32Array(N);
    this.zPrev = new Float32Array(N);
    this.zTmp = new Float32Array(N);
    this.shimmer = new Float32Array(N);
    this.texData = new Uint8Array(N * 4);

    this.reset(opts.initialValue ?? 0.28);
  }

  _toNdcX(cx) { return (cx / this.width * 2 - 1) * this.aspect; }
  _toNdcY(cy) { return 1 - (cy / this.height * 2); }
  _pxToNdc(px) { return px * (2 / this.height); }

  _initGL() {
    const gl = this.glCanvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.prog = createProgram(gl);
    this.vao = gl.createVertexArray();

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.u = {};
    for (const n of ['uSim', 'uRes', 'uSize', 'uTime', 'uDial', 'uDialMeta', 'uBead']) {
      this.u[n] = gl.getUniformLocation(this.prog, n);
    }
  }

  reset(initialVal = 0.28) {
    this.time = 1.0;
    this.value = Math.max(0, Math.min(1, initialVal)); // 0..1
    this.angVel = 0; // radians / sec in CSS clockwise coords
    this.swirlPhase = 0;
    this.spinIntensity = 0;
    this.rCss = this.rBaseCss;
    this.rVel = 0;
    this.wobAmp = 0;
    this.wobPhase = 0.4;
    this.wobFreq = 12.5;
    this.hovered = false;
    this.dragging = false;
    this.hoverMix = 0;
    this.lastPtrAng = 0;
    this.lastTickStep = Math.round(this.value * 24);

    this._seedVortexFilm();
  }

  currentAngleCss() {
    return this.angMinCss + this.value * this.angSpan;
  }

  beadStagePos() {
    const a = this.currentAngleCss();
    const r = this.rCss + 2.5 * this.scale;
    return {
      x: this.cx + Math.cos(a) * r,
      y: this.cy + Math.sin(a) * r,
    };
  }

  hitTest(sx, sy) {
    const d = Math.hypot(sx - this.cx, sy - this.cy);
    return d <= this.rScaleCss + 12 * this.scale;
  }

  setHovered(isHov) {
    if (isHov !== this.hovered) {
      this.hovered = isHov;
      if (isHov) this.wobAmp = Math.max(this.wobAmp, 0.026);
    }
  }

  pointerDown(sx, sy) {
    if (!this.hitTest(sx, sy)) return false;
    this.audio?.unlock();
    this.dragging = true;
    this.hovered = true;
    this.lastPtrAng = Math.atan2(sy - this.cy, sx - this.cx);
    this.wobAmp = Math.max(this.wobAmp, 0.042);
    this.audio?.playTap(640);
    return true;
  }

  pointerMove(sx, sy, dt = 1 / 60) {
    if (!this.dragging) {
      this.setHovered(this.hitTest(sx, sy));
      return;
    }
    const ang = Math.atan2(sy - this.cy, sx - this.cx);
    let delta = ang - this.lastPtrAng;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.lastPtrAng = ang;

    const instVel = delta / Math.max(0.008, dt);
    this.angVel = this.angVel * 0.55 + Math.max(-16, Math.min(16, instVel)) * 0.45;
    this._applyAngleDelta(delta, true);
  }

  pointerUp() {
    if (!this.dragging) return;
    this.dragging = false;
    // Clamp release coasting angular velocity to a luxurious silky spin
    this.angVel = Math.max(-11.0, Math.min(11.0, this.angVel * 0.72));
  }

  nudge(deltaVal) {
    this.audio?.unlock();
    const deltaAng = deltaVal * this.angSpan;
    this.angVel += Math.sign(deltaAng) * 3.8;
    this._applyAngleDelta(deltaAng, true);
  }

  _applyAngleDelta(deltaAng, isUser) {
    const prevVal = this.value;
    const rawVal = this.value + deltaAng / this.angSpan;
    if (rawVal < 0 || rawVal > 1) {
      // Elastic rubbery soap stop at 0 or 100!
      const overshot = rawVal < 0 ? -rawVal : rawVal - 1;
      this.value = Math.max(0, Math.min(1, rawVal));
      if (Math.abs(this.angVel) > 1.2) {
        this.wobAmp = Math.max(this.wobAmp, Math.min(0.075, 0.03 + overshot * 0.25));
        this.rVel += 26 * this.scale;
        this._impulseRingWave(0.32);
        this.angVel *= -0.25;
      } else {
        this.angVel *= 0.2;
      }
    } else {
      this.value = rawVal;
    }

    const stepIdx = Math.round(this.value * 24);
    if (stepIdx !== this.lastTickStep) {
      this.lastTickStep = stepIdx;
      this.audio?.playDialTick(this.value);
    }

    if (Math.abs(this.value - prevVal) > 1e-5) {
      this.onChange(Math.round(this.value * 100), this.value);
    }
  }

  _seedVortexFilm() {
    const { nx, ny } = this;
    for (let j = 0; j < ny; j++) {
      const y = (j / (ny - 1)) * 2 - 1;
      for (let i = 0; i < nx; i++) {
        const x = (i / (nx - 1)) * 2 - 1;
        const r = Math.hypot(x, y);
        const a = Math.atan2(y, x);
        const idx = j * nx + i;
        // Rich initial multi-band spiral thickness so even at rest it looks like blown liquid glass!
        const bands = 0.26 * Math.sin(a * 2.0 - r * 5.2 + 0.6)
                    + 0.16 * Math.cos(a * 3.0 + r * 3.8 - 0.9);
        this.thick[idx] = Math.max(0.06, Math.min(0.94, 0.48 + bands));
        this.z[idx] = 0;
        this.zPrev[idx] = 0;
        this.shimmer[idx] = 0.08;
        // Gentle initial azimuthal convection curl
        const swirl = Math.exp(-Math.pow((r - 0.65) / 0.35, 2)) * 0.65;
        this.vx[idx] = -y * swirl;
        this.vy[idx] = x * swirl;
      }
    }
    for (let s = 0; s < 14; s++) this._stepFluid(0.024);
  }

  _injectRotaryVortex(angVelCss, beadAngCss, h) {
    // Injects authentic azimuthal shear + trailing Marangoni thickness plume from the orbiting indicator bead!
    // NOTE: CSS screen angles increase clockwise, whereas fluid texture Y-up has CCW positive -> flip sign!
    const omega = -angVelCss;
    const absW = Math.min(14.0, Math.abs(omega));
    if (absW < 0.02) return;

    const { nx, ny, vx, vy, thick, shimmer, z } = this;
    const beadAngNdc = -beadAngCss;
    const bx = Math.cos(beadAngNdc) * 0.84;
    const by = Math.sin(beadAngNdc) * 0.84;

    const shearGain = Math.min(2.4, absW * 0.24) * Math.sign(omega) * h * 26.0;
    const plumePhase = this.time * 4.5 + this.swirlPhase * 1.2;

    for (let j = 1; j < ny - 1; j++) {
      const y = (j / (ny - 1)) * 2 - 1;
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const x = (i / (nx - 1)) * 2 - 1;
        const r = Math.hypot(x, y);
        if (r > 1.02 || r < 0.08) continue;

        const idx = row + i;
        // Azimuthal boundary shear strongest in outer ring (r = 0.55..0.95) -> twists fluid into true spirals!
        const tx = -y / r;
        const ty = x / r;
        const rimProfile = Math.exp(-Math.pow((r - 0.78) / 0.28, 2));
        vx[idx] += tx * shearGain * rimProfile;
        vy[idx] += ty * shearGain * rimProfile;

        // Trailing iridescent wake plume + Kelvin-Helmholtz ripple right behind the rotating indicator bead!
        const dbx = x - bx;
        const dby = y - by;
        const d2 = dbx * dbx + dby * dby;
        if (d2 < 0.16) {
          const wBead = Math.exp(-d2 * 18.0);
          const freshThick = 0.50 + 0.44 * Math.sin(plumePhase + r * 6.0);
          thick[idx] += (freshThick - thick[idx]) * Math.min(0.45, wBead * absW * 0.09);
          // Paired wake swirl + capillary surface wave
          vx[idx] += (-dby * 2.2 + tx * 1.4) * Math.sign(omega) * absW * wBead * h * 3.5;
          vy[idx] += (dbx * 2.2 + ty * 1.4) * Math.sign(omega) * absW * wBead * h * 3.5;
          z[idx] += Math.sin(plumePhase * 2.0) * 0.045 * Math.min(1.0, absW * 0.25) * wBead;
          shimmer[idx] = Math.min(1.0, shimmer[idx] + wBead * absW * 0.025);
        }
      }
    }
  }

  _impulseRingWave(amp) {
    const { nx, ny, z, shimmer } = this;
    for (let j = 1; j < ny - 1; j++) {
      const y = (j / (ny - 1)) * 2 - 1;
      for (let i = 1; i < nx - 1; i++) {
        const x = (i / (nx - 1)) * 2 - 1;
        const r = Math.hypot(x, y);
        const w = Math.exp(-Math.pow((r - 0.78) / 0.16, 2));
        if (w < 0.02) continue;
        const idx = j * nx + i;
        z[idx] += amp * w;
        shimmer[idx] = Math.min(1, shimmer[idx] + Math.abs(amp) * w);
      }
    }
  }

  _stepFluid(h) {
    const { nx, ny, vx, vy, vxTmp, vyTmp, div, press, pressTmp, curl, thick, thickTmp } = this;
    // Stronger advection scale so swirling spiral arms stay ultra crisp and lively!
    const advScale = h * 11.5;

    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        curl[idx] = 0.5 * ((vy[idx + 1] - vy[idx - 1]) - (vx[idx + nx] - vx[idx - nx]));
      }
    }
    const vortAmp = 2.6 * h;
    for (let j = 2; j < ny - 2; j++) {
      const row = j * nx;
      for (let i = 2; i < nx - 2; i++) {
        const idx = row + i;
        const dwDx = Math.abs(curl[idx + 1]) - Math.abs(curl[idx - 1]);
        const dwDy = Math.abs(curl[idx + nx]) - Math.abs(curl[idx - nx]);
        const len = Math.hypot(dwDx, dwDy) + 1e-5;
        vx[idx] += (dwDy / len) * curl[idx] * vortAmp;
        vy[idx] -= (dwDx / len) * curl[idx] * vortAmp;
      }
    }

    // Low viscous decay so the vortex coasts and unwinds smoothly for seconds after release!
    const damp = Math.exp(-0.62 * h);
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        let x = Math.max(0.5, Math.min(nx - 1.501, i - vx[idx] * advScale));
        let y = Math.max(0.5, Math.min(ny - 1.501, j - vy[idx] * advScale));
        const i0 = x | 0, j0 = y | 0;
        const fx = x - i0, fy = y - j0;
        const r0 = j0 * nx + i0, r1 = r0 + nx;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        vxTmp[idx] = (vx[r0] * w00 + vx[r0 + 1] * w10 + vx[r1] * w01 + vx[r1 + 1] * w11) * damp;
        vyTmp[idx] = (vy[r0] * w00 + vy[r0 + 1] * w10 + vy[r1] * w01 + vy[r1 + 1] * w11) * damp;
      }
    }
    vx.set(vxTmp);
    vy.set(vyTmp);

    for (let i = 0; i < nx; i++) {
      vx[i] = 0; vy[i] = 0;
      const top = (ny - 1) * nx + i;
      vx[top] = 0; vy[top] = 0;
    }
    for (let j = 0; j < ny; j++) {
      const L = j * nx;
      vx[L] = 0; vy[L] = 0;
      vx[L + nx - 1] = 0; vy[L + nx - 1] = 0;
    }

    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        div[idx] = -0.5 * (vx[idx + 1] - vx[idx - 1] + vy[idx + nx] - vy[idx - nx]);
        press[idx] *= 0.85;
      }
    }
    for (let iter = 0; iter < 5; iter++) {
      for (let j = 1; j < ny - 1; j++) {
        const row = j * nx;
        for (let i = 1; i < nx - 1; i++) {
          const idx = row + i;
          pressTmp[idx] = 0.25 * (div[idx] + press[idx - 1] + press[idx + 1] + press[idx - nx] + press[idx + nx]);
        }
      }
      press.set(pressTmp);
    }
    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        vx[idx] -= 0.5 * (press[idx + 1] - press[idx - 1]);
        vy[idx] -= 0.5 * (press[idx + nx] - press[idx - nx]);
      }
    }

    // Gentle thickness advection with minimal diffusion so spiral interference ribbons stay razor-distinct!
    const drain = 0.055 * h;
    for (let j = 0; j < ny; j++) {
      const y = (j / (ny - 1)) * 2 - 1;
      for (let i = 0; i < nx; i++) {
        const x = (i / (nx - 1)) * 2 - 1;
        const idx = j * nx + i;
        let sx = Math.max(0.001, Math.min(nx - 1.002, i - vx[idx] * advScale));
        let sy = Math.max(0.001, Math.min(ny - 1.002, j - vy[idx] * advScale));
        const i0 = sx | 0, j0 = sy | 0;
        const fx = sx - i0, fy = sy - j0;
        const r0 = j0 * nx + i0, r1 = r0 + nx;
        let val =
          thick[r0] * (1 - fx) * (1 - fy) +
          thick[r0 + 1] * fx * (1 - fy) +
          thick[r1] * (1 - fx) * fy +
          thick[r1 + 1] * fx * fy;
        const a = Math.atan2(y, x);
        const r = Math.hypot(x, y);
        const eq = 0.48 + 0.22 * Math.sin(a * 2.0 - r * 4.0 + this.time * 0.35);
        val += (eq - val) * drain;
        thickTmp[idx] = Math.max(0.04, Math.min(0.96, val));
      }
    }
    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        const avg = 0.25 * (thickTmp[idx - 1] + thickTmp[idx + 1] + thickTmp[idx - nx] + thickTmp[idx + nx]);
        thick[idx] = thickTmp[idx] + (avg - thickTmp[idx]) * 0.055;
      }
    }
    for (let i = 0; i < nx; i++) {
      thick[i] = thickTmp[i];
      thick[(ny - 1) * nx + i] = thickTmp[(ny - 1) * nx + i];
    }
    for (let j = 0; j < ny; j++) {
      thick[j * nx] = thickTmp[j * nx];
      thick[j * nx + nx - 1] = thickTmp[j * nx + nx - 1];
    }
  }

  step(dt) {
    const h = Math.min(dt, 0.033);
    this.time += h;

    // 1. Silky inertial coasting when released
    if (!this.dragging) {
      if (Math.abs(this.angVel) > 0.015) {
        this._applyAngleDelta(this.angVel * h, false);
        this.angVel *= Math.exp(-3.4 * h);
      } else {
        this.angVel = 0;
      }
    } else {
      // Decay velocity slightly if pointer holds still while grabbed
      this.angVel *= Math.exp(-7.5 * h);
    }

    const absVel = Math.abs(this.angVel);
    this.swirlPhase += (-this.angVel * 0.65 + 0.25) * h;
    const targetSpin = Math.min(1.0, absVel / 6.5);
    this.spinIntensity += (targetSpin - this.spinIntensity) * Math.min(1, h * 7.5);
    this.hoverMix += (((this.hovered || this.dragging) ? 1 : 0) - this.hoverMix) * Math.min(1, h * 11);

    // Subtle centrifugal dome swell + hover buoyancy
    const targetR = this.rBaseCss * (1.0 + this.spinIntensity * 0.036 + this.hoverMix * 0.012);
    this.rVel += ((targetR - this.rCss) * 210 - this.rVel * 16.0) * h;
    this.rCss += this.rVel * h;

    this.wobPhase += (this.wobFreq + this.spinIntensity * 6.0) * h;
    this.wobAmp *= Math.exp(-3.6 * h);

    // 2. Drive the 80x80 circular Navier-Stokes spiral vortex!
    const beadAngCss = this.currentAngleCss();
    if (absVel > 0.05) {
      this._injectRotaryVortex(this.angVel, beadAngCss, h);
    } else {
      // Whisper-gentle living ambient convection
      this._injectRotaryVortex(0.28 * Math.sin(this.time * 0.55), beadAngCss, h);
    }

    this._stepFluid(h);
    const { nx, ny, z, zPrev, zTmp, shimmer } = this;
    const c2 = 0.22;
    const dampZ = 0.945;
    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        const lap = z[idx - 1] + z[idx + 1] + z[idx - nx] + z[idx + nx] - 4.0 * z[idx];
        zTmp[idx] = Math.max(-1.0, Math.min(1.0, (2.0 * z[idx] - zPrev[idx] + c2 * lap) * dampZ * 0.988));
        shimmer[idx] *= Math.exp(-2.6 * h);
      }
    }
    zPrev.set(z);
    z.set(zTmp);

    const data = this.texData;
    for (let k = 0; k < nx * ny; k++) {
      const p4 = k * 4;
      data[p4] = Math.max(0, Math.min(255, (this.thick[k] * 255) | 0));
      data[p4 + 1] = Math.max(0, Math.min(255, ((z[k] * 0.5 + 0.5) * 255) | 0));
      data[p4 + 2] = Math.max(0, Math.min(255, (shimmer[k] * 255) | 0));
      data[p4 + 3] = 255;
    }
  }

  _drawUnderDial() {
    const ctx = this.underCtx;
    const dpr = this.dpr;
    const W = this.underCanvas.width;
    const H = this.underCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = this.cx * dpr;
    const cy = this.cy * dpr;
    const sc = this.scale * dpr;

    // 1. Minimalist precision 270-degree outer radial tick ring (25 crisp ticks)
    const ticks = 24;
    const rInner = (this.rScaleCss - 3.5 * this.scale) * dpr;
    const rOuterShort = (this.rScaleCss + 2.5 * this.scale) * dpr;
    const rOuterMajor = (this.rScaleCss + 6.5 * this.scale) * dpr;

    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i <= ticks; i++) {
      const frac = i / ticks;
      const ang = this.angMinCss + frac * this.angSpan;
      const isMajor = (i % 6 === 0);
      const isFilled = frac <= this.value + 0.008;

      const x0 = cx + Math.cos(ang) * rInner;
      const y0 = cy + Math.sin(ang) * rInner;
      const r1 = isMajor ? rOuterMajor : rOuterShort;
      const x1 = cx + Math.cos(ang) * r1;
      const y1 = cy + Math.sin(ang) * r1;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineWidth = (isMajor ? 1.65 : 1.15) * sc;
      ctx.strokeStyle = isFilled
        ? `rgba(22, 24, 38, ${isMajor ? 0.72 : 0.44})`
        : `rgba(22, 24, 38, ${isMajor ? 0.17 : 0.10})`;
      ctx.stroke();
    }

    // Whisper-subtle active progress arc hugging inside the ticks
    ctx.beginPath();
    ctx.arc(cx, cy, (this.rScaleCss - 9.0 * this.scale) * dpr, this.angMinCss, this.currentAngleCss(), false);
    ctx.strokeStyle = 'rgba(22, 24, 38, 0.14)';
    ctx.lineWidth = 1.3 * sc;
    ctx.stroke();

    // 2. Crisp dark core pip inside the orbiting 3D soap indicator bead!
    const bead = this.beadStagePos();
    ctx.beginPath();
    ctx.arc(bead.x * dpr, bead.y * dpr, (2.6 + this.hoverMix * 0.5) * sc, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(20, 22, 34, ${0.72 + this.hoverMix * 0.22})`;
    ctx.fill();

    // 3. Razor-clean tabular numeric readout + tracked micro-label in the clear center aperture
    const displayNum = this.format ? this.format(this.value) : String(Math.round(this.value * 100));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${36 * sc}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(20, 22, 34, 0.88)';
    ctx.fillText(displayNum, cx, cy - 4 * sc);

    ctx.font = `600 ${9.2 * sc}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(20, 22, 34, 0.36)';
    // Subtle manual letter spacing for universal Canvas 2D compatibility
    const chars = this.label.split('');
    const spacing = 1.8 * sc;
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const totalW = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let lx = cx - totalW * 0.5;
    for (let i = 0; i < chars.length; i++) {
      ctx.textAlign = 'left';
      ctx.fillText(chars[i], lx, cy + 20.5 * sc);
      lx += widths[i] + spacing;
    }

    ctx.restore();
  }

  render() {
    this._drawUnderDial();

    const { gl, u } = this;
    gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.nx, this.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.texData);

    gl.uniform1i(u.uSim, 0);
    gl.uniform2f(u.uRes, this.glCanvas.width, this.glCanvas.height);
    gl.uniform2f(u.uSize, this.width, this.height);
    gl.uniform1f(u.uTime, this.time);

    gl.uniform4f(
      u.uDial,
      this._toNdcX(this.cx),
      this._toNdcY(this.cy),
      this._pxToNdc(this.rCss),
      this.wobAmp
    );
    gl.uniform4f(
      u.uDialMeta,
      this.wobPhase,
      -this.currentAngleCss(),
      this.spinIntensity,
      this.swirlPhase
    );

    const bead = this.beadStagePos();
    const beadR = this.rBeadCss * (1.0 + this.hoverMix * 0.14);
    gl.uniform4f(
      u.uBead,
      this._toNdcX(bead.x),
      this._toNdcY(bead.y),
      this._pxToNdc(beadR),
      this.hoverMix
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
