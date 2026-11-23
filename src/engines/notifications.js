// ============================================================================
// SOAP FILM · FOAM NOTIFICATION STACK (PLATEAU WALLS + POP-TO-DISMISS)
// ============================================================================
// Notification pill-bubbles cluster together in real Plateau's Law equilibrium:
// where two bubbles press against each other (dy = 2 * R * sin(60deg)), their
// shared boundary flattens into a luminous iridescent soap septum meeting the
// outer silhouette at 120-degree Plateau triple-junction vertices.
// Clicking or flicking any notification swells and pops it with a capsule soap
// rupture ring + 3D droplet mist; neighbors instantly recoil round and rebound
// together into fresh foam equilibrium.

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

uniform sampler2D uSim;       // R: thickness, G: z-wave, B: shimmer
uniform vec2 uRes;
uniform vec2 uSize;
uniform float uTime;

// Up to 4 active foam notification pill-bubbles:
// uPills[i]    = (cx, cy, hw, hh) in NDC (corner radius = hh -> stadium pill)
// uPillMeta[i] = (wobAmp, wobPhase, charge 0..1, dNmSeed)
// uPillVis[i]  = (alpha 0..1, hover 0..1, squashY, 0)
#define MAX_PILLS 4
uniform int uPillCount;
uniform vec4 uPills[MAX_PILLS];
uniform vec4 uPillMeta[MAX_PILLS];
uniform vec4 uPillVis[MAX_PILLS];

// Up to 2 simultaneous capsule soap rupture rings when notifications pop:
// uPopPos[i]  = (cx, cy, hw, hh)
// uPopInfo[i] = (expandNdc, alpha 0..1, seed, 0)
#define MAX_RINGS 2
uniform vec4 uPopPos[MAX_RINGS];
uniform vec4 uPopInfo[MAX_RINGS];

// Delicate 3D WebGL2 iridescent mist droplets shed on pop
#define MAX_DAUGHTERS 20
uniform int uDaughterCount;
uniform vec4 uDPos[MAX_DAUGHTERS]; // (x, y, radius, alpha)
uniform vec4 uDOpt[MAX_DAUGHTERS]; // (dNm, wobAmp, wobPhase, age)

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
  float coh = exp(-max(0.0, dNm - 160.0) * 0.00042);
  for (int i = 0; i < 6; i++) {
    float phase = 6.2831853 * opd / WL[i];
    float s = sin(phase * 0.5);
    float r = mix(0.5, s * s, coh);
    col += WRGB[i] * r;
  }
  col *= vec3(1.12, 1.04, 1.16);
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.58);
  col = pow(clamp(col, 1e-4, 1.25), vec3(0.92));

  float newton = smoothstep(14.0, 62.0, dNm);
  return clamp(col * newton, 0.0, 1.25);
}

vec4 over(vec4 src, vec4 dst) {
  return vec4(src.rgb + dst.rgb * (1.0 - src.a), src.a + dst.a * (1.0 - src.a));
}

// Stadium pill SDF with organic capillary wall wobble
float sdPillRaw(vec2 p, vec2 c, vec2 b) {
  float r = min(b.x, b.y);
  vec2 q = abs(p - c) - (b - vec2(r));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sdFoamPill(vec2 p, vec4 pill, vec4 meta, vec4 vis) {
  vec2 c = pill.xy;
  float sq = 1.0 + clamp(vis.z, -0.18, 0.18);
  vec2 b = vec2(pill.z / sqrt(max(0.6, sq)), pill.w * sq);
  float r = min(b.x, b.y);
  vec2 dp = p - c;
  vec2 q = abs(dp) - (b - vec2(r));
  float base = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;

  float ang = atan(dp.y, dp.x * 0.42);
  float wobAmp = meta.x + meta.z * 0.022;
  float ph = meta.y;
  float wob = wobAmp * (0.66 * cos(2.0 * ang + ph) + 0.34 * sin(3.0 * ang - ph * 1.3)) * r;
  float breath = 0.0045 * sin(2.0 * ang + uTime * 2.1 + meta.w * 0.015) * r;
  return base - wob - breath;
}

// Photorealistic 3D WebGL2 pop-mist micro-bubble
vec4 evalDaughterBubble(vec2 p, vec4 posR, vec4 opt, float px) {
  float r = posR.z;
  float a = posR.w;
  if (r <= 0.001 || a <= 0.002) return vec4(0.0);

  vec2 dp = p - posR.xy;
  float wobAmp = opt.y;
  float rPad = r * (1.0 + abs(wobAmp) * 1.18) + px * 3.0;
  if (dot(dp, dp) > rPad * rPad) return vec4(0.0);

  float ang = atan(dp.y, dp.x);
  float phase = opt.z;
  float wob = wobAmp * (0.72 * cos(2.0 * ang + phase) + 0.28 * sin(3.0 * ang - phase * 1.35));
  float rEff = max(0.0022, r * (1.0 + wob));
  float dist = length(dp);
  float sd = dist - rEff;
  float mask = smoothstep(px * 1.35, -px * 1.35, sd);
  if (mask <= 0.001) return vec4(0.0);

  vec2 nXY = dp / max(rEff, 0.004);
  float r2 = clamp(dot(nXY, nXY), 0.0, 0.992);
  float nz = sqrt(max(0.06, 1.0 - r2));
  vec2 swirlN = 0.055 * vec2(
    sin(nXY.y * 3.8 + uTime * 2.4 + phase),
    cos(nXY.x * 3.4 - uTime * 2.1 + phase * 1.3)
  );
  vec3 N = normalize(vec3(nXY + swirlN * (1.0 - r2 * 0.55), nz));
  float NdotV = clamp(N.z, 0.06, 1.0);
  float fres = pow(max(1e-4, 1.0 - NdotV), 2.20);
  float razorRim = pow(max(1e-4, 1.0 - NdotV), 4.7);

  float drainGrad = (0.5 - 0.5 * nXY.y) * 165.0;
  float swirlBand = 115.0 * sin(nXY.x * 2.5 - nXY.y * 3.0 + uTime * 2.0 + phase);
  float dNm = opt.x + drainGrad + swirlBand + fres * 230.0;
  float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
  float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
  vec3 irid = bubbleIridescence(dNm, cosTheta);

  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L1 = normalize(vec3(-0.56, 0.78, 0.46));
  vec3 H1 = normalize(L1 + V);
  float ndh1 = max(0.0, dot(N, H1));
  float spec1 = smoothstep(0.84, 0.94, ndh1) * 0.76 + smoothstep(0.955, 0.992, ndh1) * 0.98;

  vec3 L2 = normalize(vec3(0.66, -0.58, 0.44));
  vec3 H2 = normalize(L2 + V);
  float ndh2 = max(0.0, dot(N, H2));
  float spec2 = smoothstep(0.87, 0.96, ndh2) * 0.52;

  float skyArc = smoothstep(0.20, 0.88, -nXY.x * 0.55 + nXY.y * 0.85) * smoothstep(0.18, 0.82, 1.0 - NdotV) * 0.24;

  float rNorm = sqrt(r2);
  float rimOff = max(0.055, min(0.16, px * 1.15 / max(rEff, 0.004)));
  float icArg = (1.0 - rNorm - rimOff) / max(0.042, rimOff * 0.72);
  float innerContour = exp(-(icArg * icArg));
  float hairOff = min(0.045, px * 0.48 / max(rEff, 0.004));
  float ohArg = (1.0 - rNorm - hairOff) / max(0.024, px * 0.55 / max(rEff, 0.004));
  float outerHair = exp(-(ohArg * ohArg));

  vec3 contourCol = mix(vec3(0.34, 0.39, 0.65), irid * 0.64 + vec3(0.16, 0.15, 0.32), 0.52);
  vec3 domeCol = mix(vec3(0.95, 0.97, 1.0), irid * 0.94 + vec3(0.14, 0.16, 0.24), 0.88);
  vec3 col = mix(vec3(0.98, 0.99, 1.0), domeCol, clamp(0.12 + fres * 0.82, 0.0, 1.0));
  col = mix(col, contourCol, clamp(innerContour * 0.54 + razorRim * 0.44, 0.0, 0.78));
  float crescent = smoothstep(0.10, 0.76, fres) * (1.0 - outerHair * 0.62);
  col = mix(col, clamp(irid * 1.12 + vec3(0.08, 0.07, 0.12), 0.0, 1.0), crescent * 0.68);
  col = mix(col, vec3(1.0, 0.998, 1.0), clamp((spec1 + spec2 + skyArc) * 0.96 + outerHair * 0.84, 0.0, 0.99));

  float alpha = clamp(0.048 + fres * 0.76 + innerContour * 0.48 + outerHair * 0.72 + (spec1 + spec2 + skyArc) * 0.88, 0.0, 0.95);
  return vec4(col * (alpha * mask * a), alpha * mask * a);
}

// ============================================================================
// PLATEAU FOAM FIELD EVALUATION (OUTER ENVELOPE + SHARED VORONOI SEPTUM)
// ============================================================================
void evalFoamField(
  vec2 p,
  out float outOuter,
  out float outCellIn,
  out float outSep,
  out float outContact,
  out float outDnmSeed,
  out float outCharge,
  out float outHover,
  out float outAlpha,
  out vec2 outCenter,
  out vec2 outHalfSize
) {
  float d1 = 10.0;
  float d2 = 10.0;
  int i1 = -1;
  int i2 = -1;

  for (int i = 0; i < MAX_PILLS; i++) {
    if (i >= uPillCount) break;
    if (uPillVis[i].x <= 0.005) continue;
    float di = sdFoamPill(p, uPills[i], uPillMeta[i], uPillVis[i]);
    if (di < d1) {
      d2 = d1; i2 = i1;
      d1 = di; i1 = i;
    } else if (di < d2) {
      d2 = di; i2 = i;
    }
  }

  if (i1 < 0) {
    outOuter = 10.0;
    outCellIn = 0.0;
    outSep = 10.0;
    outContact = 0.0;
    outDnmSeed = 0.0;
    outCharge = 0.0;
    outHover = 0.0;
    outAlpha = 0.0;
    outCenter = vec2(0.0);
    outHalfSize = vec2(0.16);
    return;
  }

  // Tiny authentic 120-degree Plateau liquid meniscus fillet ONLY at outer triple-junction notches
  float dOuter = (i2 >= 0) ? smin(d1, d2, 0.022) : d1;
  float dOut = max(0.0, -dOuter);
  float dSep = (i2 >= 0) ? max(0.0, 0.5 * (d2 - d1)) : 10.0;

  // Inner depth of cell i1: approaches 0 along BOTH its outer silhouette AND any shared Plateau septum!
  float dCellIn = smin(dOut, dSep, 0.026);
  // Contact strength is 1 right along an active shared soap wall where two pills actually press together
  float contact = (i2 >= 0) ? smoothstep(0.018, -0.008, d2) : 0.0;

  // Softly antialias per-cell optical properties across the 2px shared septum (zero staircase!)
  float mix12 = (i2 >= 0) ? smoothstep(0.009, 0.0, dSep) * 0.5 : 0.0;
  float seed1 = uPillMeta[i1].w;
  float seed2 = (i2 >= 0) ? uPillMeta[i2].w : seed1;
  float ch1 = uPillMeta[i1].z;
  float ch2 = (i2 >= 0) ? uPillMeta[i2].z : ch1;
  float hov1 = uPillVis[i1].y;
  float hov2 = (i2 >= 0) ? uPillVis[i2].y : hov1;
  float a1 = uPillVis[i1].x;
  float a2 = (i2 >= 0) ? uPillVis[i2].x : a1;

  outOuter = dOuter;
  outCellIn = max(0.0, dCellIn);
  outSep = dSep;
  outContact = contact;
  outDnmSeed = mix(seed1, seed2, mix12);
  outCharge = mix(ch1, ch2, mix12);
  outHover = mix(hov1, hov2, mix12);
  outAlpha = mix(a1, a2, mix12);
  outCenter = uPills[i1].xy;
  outHalfSize = uPills[i1].zw;
}

float evalCellDepthOnly(vec2 p) {
  float d1 = 10.0;
  float d2 = 10.0;
  int i2 = -1;
  for (int i = 0; i < MAX_PILLS; i++) {
    if (i >= uPillCount) break;
    if (uPillVis[i].x <= 0.005) continue;
    float di = sdFoamPill(p, uPills[i], uPillMeta[i], uPillVis[i]);
    if (di < d1) {
      d2 = d1; i2 = 1;
      d1 = di;
    } else if (di < d2) {
      d2 = di; i2 = 1;
    }
  }
  float dOuter = (i2 >= 0) ? smin(d1, d2, 0.022) : d1;
  float dOut = max(0.0, -dOuter);
  float dSep = (i2 >= 0) ? max(0.0, 0.5 * (d2 - d1)) : 10.0;
  return max(0.0, smin(dOut, dSep, 0.026));
}

void main() {
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2((vUv.x * 2.0 - 1.0) * aspect, (vUv.y * 2.0 - 1.0));
  float px = 2.0 / uSize.y;

  vec4 outCol = vec4(0.0);

  // Fast bounding-box early-out covering the vertical foam stack + drag peel + pop rings
  bool inStageBox = (abs(p.x) < 1.56) && (abs(p.y) < 0.98);

  if (inStageBox && uPillCount > 0) {
    // --- 1. SEAMLESS AIRY FLOATING SHADOWS BENEATH EACH FOAM PILL ---
    {
      float shAcc = 0.0;
      for (int i = 0; i < MAX_PILLS; i++) {
        if (i >= uPillCount) break;
        float va = uPillVis[i].x;
        if (va <= 0.005) continue;
        vec2 shPos = uPills[i].xy + vec2(0.014, -0.044);
        vec2 shB = uPills[i].zw * vec2(1.06, 1.18);
        float dSh = sdPillRaw(p, shPos, shB);
        if (dSh < 0.14) {
          float s = smoothstep(0.115, -0.045, dSh) * (0.036 + 0.016 * uPillVis[i].y) * va;
          shAcc = max(shAcc, s);
        }
      }
      if (shAcc > 0.001) {
        outCol = over(vec4(vec3(0.24, 0.26, 0.44) * shAcc, shAcc), outCol);
      }
    }

    // --- 2. 3D VOLUMETRIC PLATEAU FOAM CELLS + LUMINOUS SHARED SEPTA ---
    float dOuter, dCellIn, dSep, contact, dNmSeed, charge, hov, pillAlpha;
    vec2 cellC, cellB;
    evalFoamField(p, dOuter, dCellIn, dSep, contact, dNmSeed, charge, hov, pillAlpha, cellC, cellB);

    float orbMask = smoothstep(px * 1.65, -px * 1.65, dOuter) * pillAlpha;
    if (orbMask > 0.001) {
      float eps = 0.0036;
      // Negative gradient of dCellIn points smoothly outward toward BOTH outer walls AND shared Plateau septa!
      vec2 rawGrad = -vec2(
        evalCellDepthOnly(p + vec2(eps, 0.0)) - evalCellDepthOnly(p - vec2(eps, 0.0)),
        evalCellDepthOnly(p + vec2(0.0, eps)) - evalCellDepthOnly(p - vec2(0.0, eps))
      ) / (2.0 * eps);
      vec2 gSmooth = rawGrad / sqrt(dot(rawGrad, rawGrad) + 0.035);

      float scaleSafe = max(0.055, min(cellB.x, cellB.y) * 0.96);
      float normDepth = clamp(dCellIn / scaleSafe, 0.0, 1.0);
      // Plush pillow profile: steep glossy shoulders at outer rim AND shared septum, crystal-clear center over text!
      float rho = 1.0 - normDepth;
      float pillowRim = pow(clamp(rho, 1e-4, 0.996), 2.15);

      // Sample live 2D Navier-Stokes fluid grid
      vec2 simUv = clamp((p / vec2(2.85, 1.95)) + 0.5, 0.004, 0.996);
      vec2 texel = 1.0 / vec2(textureSize(uSim, 0));
      vec4 simC = texture(uSim, simUv);
      float zL = texture(uSim, simUv - vec2(texel.x, 0.0)).g;
      float zR = texture(uSim, simUv + vec2(texel.x, 0.0)).g;
      float zD = texture(uSim, simUv - vec2(0.0, texel.y)).g;
      float zU = texture(uSim, simUv + vec2(0.0, texel.y)).g;
      vec2 gradZ = vec2(zR - zL, zU - zD) * 5.0 * (0.24 + 0.76 * max(pillowRim, contact * exp(-dSep * 28.0)));

      vec2 swirlTilt = (0.018 + 0.024 * charge + 0.018 * hov) * vec2(
        sin(p.y * 12.0 + p.x * 4.5 + uTime * 2.2),
        cos(p.x * 10.5 - p.y * 5.0 - uTime * 1.9)
      ) * (0.28 + 0.72 * pillowRim);

      vec2 nXY = gSmooth * (pillowRim * (0.90 + 0.08 * charge)) + swirlTilt - gradZ;
      float nXY2 = dot(nXY, nXY);
      vec3 N = normalize(vec3(nXY, sqrt(max(0.06, 1.0 - min(0.94, nXY2)))));
      vec3 V = vec3(0.0, 0.0, 1.0);
      float NdotV = clamp(dot(N, V), 0.06, 1.0);
      float slopeMag = length(gradZ);

      float fres = pow(max(1e-4, 1.0 - NdotV), 2.15);
      float razorRim = pow(max(1e-4, 1.0 - NdotV), 4.6);

      // Crisp optical rim contour around outer boundary AND along each shared Plateau wall!
      float rimOff = max(0.042, min(0.16, px * 1.25 / scaleSafe));
      float ioArg = (normDepth - rimOff) / max(0.032, rimOff * 0.72);
      float innerOutline = exp(-(ioArg * ioArg));
      float hairOff = min(0.040, px * 0.50 / scaleSafe);
      float owArg = (normDepth - hairOff) / max(0.020, px * 0.55 / scaleSafe);
      float outerWhiteHair = exp(-(owArg * owArg));

      // Authentic luminous shared Plateau contact septum + glowing 120-degree liquid vertices!
      float dOutPos = max(0.0, -dOuter);
      float sCoreArg = dSep / max(0.0042, px * 1.05);
      float septumCore = exp(-(sCoreArg * sCoreArg)) * contact;
      float sGlowArg = dSep / 0.028;
      float septumGlow = exp(-(sGlowArg * sGlowArg)) * contact;
      // 120-degree Plateau vertex meniscus bead where outer edge meets shared septum
      float vDist2 = dSep * dSep + dOutPos * dOutPos;
      float vertexBead = exp(-vDist2 / 0.00052) * contact;

      // Thin-film interference color (each bubble has its own film thickness offset across the septum!)
      float flowWave = 0.5 + 0.5 * sin(p.x * 3.8 - p.y * 5.2 + simC.r * 3.4 + uTime * 1.15);
      float dNmBase = mix(155.0, 725.0, simC.r * 0.62 + flowWave * 0.38);
      float dNm = dNmBase + dNmSeed + p.x * 85.0 + fres * 240.0 + septumGlow * 170.0 - charge * 135.0;

      float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
      float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
      vec3 irid = bubbleIridescence(dNm, cosTheta);

      // Curved glass studio specular arcs along pill top-left & bottom-right shoulders
      vec3 L1 = normalize(vec3(-0.36, 0.86, 0.44));
      vec3 H1 = normalize(L1 + V);
      float ndh1 = max(0.0, dot(N, H1));
      float spec1 = smoothstep(0.86, 0.945, ndh1) * 0.68 + smoothstep(0.96, 0.992, ndh1) * 0.92;

      vec3 L2 = normalize(vec3(0.48, -0.78, 0.44));
      vec3 H2 = normalize(L2 + V);
      float ndh2 = max(0.0, dot(N, H2));
      float spec2 = smoothstep(0.88, 0.965, ndh2) * 0.46;

      // Subtle upper-left specular highlight gleam along the curved pill shoulder (leaves text crystal clear!)
      vec2 relP = (p - cellC) / max(cellB, vec2(0.05));
      float skyArc = smoothstep(0.32, 0.92, -relP.x * 0.30 + relP.y * 0.92) * smoothstep(0.18, 0.78, 1.0 - NdotV) * 0.24;
      float specArc = clamp(spec1 + spec2 + skyArc, 0.0, 1.35) * (0.22 + 0.78 * pillowRim) * (1.0 - septumCore * 0.35);

      // Tiny sparkling micro-shimmer along rims & shared Plateau septa
      vec2 spGrid = (p + vec2(simC.r * 0.28, -simC.g * 0.22)) * 24.0;
      vec2 spCell = floor(spGrid);
      vec2 spF = fract(spGrid) - 0.5;
      float spRnd = hash21(spCell);
      float spDot = smoothstep(0.15, 0.02, length(spF)) * step(0.945 - (charge * 0.04 + septumGlow * 0.025), spRnd)
                  * (0.45 + 0.55 * sin(uTime * 6.0 + spRnd * 40.0))
                  * (0.24 + 0.65 * fres + septumGlow * 0.65 + charge * 0.55);

      float chromaRich = 0.76 + 0.24 * max(max(hov, charge), septumGlow);
      vec3 contourCol = mix(vec3(0.35, 0.39, 0.66), irid * 0.68 + vec3(0.18, 0.16, 0.36), 0.54);
      vec3 domeColor = mix(vec3(0.95, 0.97, 1.0), irid * 0.96 + vec3(0.14, 0.17, 0.25), 0.90 * chromaRich);

      // Keep pill center ultra-clear glassy white-tinted film so typography is 100% razor legible!
      vec3 col = mix(vec3(0.97, 0.98, 1.0), domeColor, clamp(0.08 + fres * 0.86 + septumGlow * 0.56 + slopeMag * 0.32 + charge * 0.22, 0.0, 1.0));
      col = mix(col, contourCol, clamp(innerOutline * 0.54 + razorRim * 0.45 + septumCore * 0.64, 0.0, 0.86));
      float crescentBand = smoothstep(0.08, 0.74, max(fres, septumGlow * 0.82)) * (1.0 - outerWhiteHair * 0.58);
      col = mix(col, clamp(irid * 1.18 + vec3(0.08, 0.07, 0.13), 0.0, 1.0), crescentBand * (0.62 + 0.22 * max(max(hov, charge), septumGlow)));
      // Luminous white specular crest on outer hair, shared Plateau septum center & 120-deg vertices!
      col = mix(col, vec3(1.0, 0.998, 1.0), clamp(specArc * 0.90 + outerWhiteHair * 0.82 + septumCore * 0.52 + vertexBead * 0.92 + spDot * 0.85, 0.0, 0.99));

      float rimAlpha = innerOutline * 0.50 + outerWhiteHair * 0.74 + razorRim * 0.55 + septumCore * 0.70 + vertexBead * 0.74;
      // Low center opacity (0.018) guarantees ultra-clean contrast over the dark notification text!
      float alpha = clamp(
        0.018 + fres * (0.68 + 0.18 * max(hov, charge)) + rimAlpha + specArc * 0.74 + septumGlow * 0.36 + slopeMag * 0.22 + spDot * 0.55,
        0.0,
        0.96
      );

      vec4 foamLayer = vec4(col * (alpha * orbMask), alpha * orbMask);
      outCol = over(foamLayer, outCol);
    }
  }

  // --- 3. EXPANDING CAPSULE IRIDESCENT SOAP RUPTURE RINGS ON POP ---
  for (int rIdx = 0; rIdx < MAX_RINGS; rIdx++) {
    vec4 rInfo = uPopInfo[rIdx];
    if (rInfo.y <= 0.005) continue;
    vec4 rPos = uPopPos[rIdx];
    float dBase = sdPillRaw(p, rPos.xy, rPos.zw);
    vec2 dp = p - rPos.xy;
    float ang = atan(dp.y, dp.x * 0.45);
    float rimWave = 0.011 * (sin(ang * 8.0 + uTime * 8.5 + rInfo.z) * 0.6 + cos(ang * 13.0 - uTime * 6.5) * 0.4);
    float ringW = max(0.009, 0.022 * rInfo.y);
    float dR = abs(dBase - (rInfo.x + rimWave));
    float ringMask = exp(-(dR * dR) / max(1e-5, ringW * ringW));
    if (ringMask > 0.005) {
      float dNmR = 250.0 + 185.0 * sin(ang * 3.0 + uTime * 5.0 + rInfo.z) + (1.0 - rInfo.y) * 165.0;
      vec3 iridR = bubbleIridescence(dNmR, 0.72);
      vec3 rCol = mix(iridR * 1.15 + vec3(0.12, 0.10, 0.18), vec3(1.0), 0.45);
      float ra = clamp(ringMask * rInfo.y * 0.84, 0.0, 0.88);
      outCol = over(vec4(rCol * ra, ra), outCol);
    }
  }

  // --- 4. 3D WEBGL2 POP-MIST MICRO-DROPLETS ---
  for (int i = 0; i < MAX_DAUGHTERS; i++) {
    if (i >= uDaughterCount) break;
    vec4 dLayer = evalDaughterBubble(p, uDPos[i], uDOpt[i], px);
    if (dLayer.a > 0.001) outCol = over(dLayer, outCol);
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

const NOTIF_TEMPLATES = [
  { icon: 'calendar', title: 'Design Review',  body: 'Starts in 5 min · Studio B',  time: 'now',  dNmSeed: 0 },
  { icon: 'chat',     title: 'Jo Reyes',       body: 'Sent the final prototype',    time: '1m',   dNmSeed: 165 },
  { icon: 'check',    title: 'Build Passed',   body: 'v2.4 deployed to staging',    time: '3m',   dNmSeed: 325 },
  { icon: 'download',  title: 'Download',       body: 'soap-renders.zip received',   time: 'now',  dNmSeed: 245 },
  { icon: 'bell',     title: 'Focus Mode',     body: '3 updates held until 6:00',   time: 'now',  dNmSeed: 85 },
];

class SoapFoamNotifications {
  constructor(container, opts = {}) {
    this.width = opts.width || 640;
    this.height = opts.height || 360;
    this.aspect = this.width / this.height;
    this.dpr = opts.dpr || 2;
    this.audio = opts.audio || null;
    this.onCountChange = opts.onCountChange || (() => {});
    this.onPop = opts.onPop || (() => {});
    this.initial = opts.initial || null;

    // Responsive sizing scaled cleanly to stage
    const scale = Math.min(1.0, (this.width - 36) / 340, (this.height - 28) / 310);
    this.scale = scale;
    this.centerX = this.width * 0.5;
    this.centerY = this.height * 0.50;

    // Pill geometry: R = 29px, Plateau equilibrium center spacing dy = 47px -> crisp flattened shared walls & 120deg vertices!
    this.pillHw = 141 * scale;
    this.pillHh = 29.0 * scale;
    this.stackDy = 47.0 * scale;

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

    // 2D Navier-Stokes fluid grid (64x48)
    this.nx = 64;
    this.ny = 48;
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

    this.maxPills = 4;
    this.maxRings = 2;
    this.maxDaughters = 20;

    this.pillBuf = new Float32Array(this.maxPills * 4);
    this.pillMetaBuf = new Float32Array(this.maxPills * 4);
    this.pillVisBuf = new Float32Array(this.maxPills * 4);
    this.ringPosBuf = new Float32Array(this.maxRings * 4);
    this.ringInfoBuf = new Float32Array(this.maxRings * 4);
    this.dPosBuf = new Float32Array(this.maxDaughters * 4);
    this.dOptBuf = new Float32Array(this.maxDaughters * 4);

    this.nextUid = 1;
    this.nextTemplateCursor = 3;
    this.reset();
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
    for (const n of ['uSim', 'uRes', 'uSize', 'uTime', 'uPillCount', 'uDaughterCount']) {
      this.u[n] = gl.getUniformLocation(this.prog, n);
    }
    this.u.uPills = gl.getUniformLocation(this.prog, 'uPills') || gl.getUniformLocation(this.prog, 'uPills[0]');
    this.u.uPillMeta = gl.getUniformLocation(this.prog, 'uPillMeta') || gl.getUniformLocation(this.prog, 'uPillMeta[0]');
    this.u.uPillVis = gl.getUniformLocation(this.prog, 'uPillVis') || gl.getUniformLocation(this.prog, 'uPillVis[0]');
    this.u.uPopPos = gl.getUniformLocation(this.prog, 'uPopPos') || gl.getUniformLocation(this.prog, 'uPopPos[0]');
    this.u.uPopInfo = gl.getUniformLocation(this.prog, 'uPopInfo') || gl.getUniformLocation(this.prog, 'uPopInfo[0]');
    this.u.uDPos = gl.getUniformLocation(this.prog, 'uDPos') || gl.getUniformLocation(this.prog, 'uDPos[0]');
    this.u.uDOpt = gl.getUniformLocation(this.prog, 'uDOpt') || gl.getUniformLocation(this.prog, 'uDOpt[0]');
  }

  _makePill(tpl, xCss, yCss, alpha = 1.0) {
    return {
      uid: this.nextUid++,
      icon: tpl.icon,
      title: tpl.title,
      body: tpl.body,
      time: tpl.time,
      dNmSeed: tpl.dNmSeed,
      xCss,
      xVel: 0,
      yCss,
      yVel: 0,
      hwCss: this.pillHw,
      hhCss: this.pillHh,
      alpha,
      hoverMix: 0,
      squash: 0,
      squashVel: 0,
      wobAmp: 0,
      wobPhase: this.nextUid * 1.35,
      wobFreq: 13.5 + (this.nextUid % 4) * 0.7,
      swayPhase: this.nextUid * 1.7,
      // Interaction / pop state
      popping: false,
      popT: 0,
      charge: 0,
      touchedBelow: false,
    };
  }

  reset() {
    this.time = 1.0;
    this.hoveredUid = -1;
    this.dragState = null; // { uid, startX, startY, origX, lastX, vx, moved }
    this.nextTemplateCursor = 3;
    this.pills = [];

    // Initial 3-bubble foam stack resting in crisp 120-degree Plateau equilibrium
    const start = (this.initial || NOTIF_TEMPLATES.slice(0, 3)).slice(0, this.maxPills);
    const n0 = start.length;
    for (let i = 0; i < n0; i++) {
      const y = this.centerY + (i - (n0 - 1) * 0.5) * this.stackDy;
      const p = this._makePill(start[i], this.centerX, y, 1.0);
      p.touchedBelow = (i < n0 - 1);
      this.pills.push(p);
    }

    this.popRings = [];
    this.floatBubbles = [];
    this._seedFilm();
    this.onCountChange(this.pills.length);
  }

  pushNotification(tplOverride = null) {
    if (this.pills.length >= this.maxPills) return false;
    this.audio?.unlock();
    const tpl = tplOverride || NOTIF_TEMPLATES[this.nextTemplateCursor % NOTIF_TEMPLATES.length];
    this.nextTemplateCursor++;

    // Spawn smoothly above the stack so viewer watches it float down & flatten into a shared Plateau wall!
    const topY = this.pills.length > 0
      ? this.pills[0].yCss - this.stackDy - 56 * this.scale
      : this.centerY - 48 * this.scale;
    const pill = this._makePill(tpl, this.centerX, Math.max(38 * this.scale, topY), 0.05);
    pill.yVel = 125 * this.scale;
    pill.wobAmp = 0.095;
    pill.touchedBelow = false;
    this.pills.unshift(pill);
    this.audio?.playTap(660);
    this.onCountChange(this.pills.length);
    return true;
  }

  pillPosByIndex(idx) {
    const p = this.pills[idx];
    if (!p) return { x: this.centerX, y: this.centerY };
    return { x: p.xCss, y: p.yCss };
  }

  pillPosByTitle(title) {
    const p = this.pills.find((q) => q.title === title);
    if (!p) return { x: this.centerX, y: this.centerY };
    return { x: p.xCss, y: p.yCss };
  }

  hitTest(sx, sy) {
    // Check pills closest to pointer center first
    let best = null;
    let bestScore = Infinity;
    for (const p of this.pills) {
      if (p.popping) continue;
      const dx = Math.abs(sx - p.xCss) - (p.hwCss - p.hhCss);
      const dy = Math.abs(sy - p.yCss);
      const dist = Math.hypot(Math.max(0, dx), dy) - p.hhCss;
      if (dist <= 6 && dy < bestScore) {
        best = p;
        bestScore = dy;
      }
    }
    return best ? best.uid : -1;
  }

  setHoveredUid(uid) {
    if (uid === this.hoveredUid) return;
    this.hoveredUid = uid;
    if (uid >= 0) {
      const p = this.pills.find((q) => q.uid === uid);
      if (p) p.wobAmp = Math.max(p.wobAmp, 0.036);
    }
  }

  pointerDown(sx, sy) {
    const uid = this.hitTest(sx, sy);
    if (uid < 0) return false;
    const p = this.pills.find((q) => q.uid === uid);
    if (!p || p.popping) return false;
    this.audio?.unlock();
    this.dragState = {
      uid,
      startX: sx,
      startY: sy,
      origX: p.xCss,
      lastX: sx,
      vx: 0,
      moved: false,
    };
    p.squashVel += 1.6;
    p.wobAmp = Math.max(p.wobAmp, 0.055);
    return true;
  }

  pointerMove(sx, sy, dt = 1 / 60) {
    if (!this.dragState) {
      this.setHoveredUid(this.hitTest(sx, sy));
      return;
    }
    const p = this.pills.find((q) => q.uid === this.dragState.uid);
    if (!p || p.popping) { this.dragState = null; return; }
    const dx = sx - this.dragState.startX;
    if (Math.abs(dx) > 7) this.dragState.moved = true;
    const instVx = (sx - this.dragState.lastX) / Math.max(0.008, dt);
    this.dragState.vx = this.dragState.vx * 0.65 + instVx * 0.35;
    this.dragState.lastX = sx;

    // Smooth lateral peel displacement with subtle elastic tension
    const clampedDx = Math.max(-135 * this.scale, Math.min(135 * this.scale, dx));
    p.xCss = this.dragState.origX + clampedDx;
    p.xVel = 0;
    // Slight stretch wobble as it peels away from neighbors' Plateau septa!
    p.wobAmp = Math.max(p.wobAmp, Math.min(0.095, Math.abs(dx) / (900 * this.scale)));
  }

  pointerUp() {
    if (!this.dragState) return;
    const ds = this.dragState;
    this.dragState = null;
    const p = this.pills.find((q) => q.uid === ds.uid);
    if (!p || p.popping) return;

    const dx = p.xCss - this.centerX;
    // Click (small movement) OR flick/drag past threshold -> POP!
    if (!ds.moved || Math.abs(dx) >= 48 * this.scale || Math.abs(ds.vx) >= 240 * this.scale) {
      this.popByUid(p.uid);
    } else {
      // Elastic snap back into foam equilibrium
      p.wobAmp = Math.max(p.wobAmp, 0.09);
      this.audio?.playFoamTouch();
    }
  }

  popByIndex(idx) {
    const p = this.pills[idx];
    if (p) this.popByUid(p.uid);
  }

  popByTitle(title) {
    const p = this.pills.find((q) => q.title === title);
    if (p) this.popByUid(p.uid);
  }

  popByUid(uid) {
    const p = this.pills.find((q) => q.uid === uid);
    if (!p || p.popping) return;
    this.audio?.unlock();
    p.popping = true;
    this.onPop(p);
    p.popT = 0;
    p.wobAmp = Math.max(p.wobAmp, 0.10);
    this.audio?.playTap(790);
  }

  _spawnCapsulePopMist(pill) {
    const cx = this._toNdcX(pill.xCss);
    const cy = this._toNdcY(pill.yCss);
    const hw = this._pxToNdc(pill.hwCss);
    const hh = this._pxToNdc(pill.hhCss);
    const count = 11;
    for (let i = 0; i < count; i++) {
      if (this.floatBubbles.length >= this.maxDaughters) this.floatBubbles.shift();
      // Distribute mist droplets evenly around the pill's capsule perimeter!
      const t = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.28;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      // Capsule perimeter point
      const flatHalf = Math.max(0, hw - hh);
      const px = cx + Math.sign(cosT) * flatHalf * Math.min(1, Math.abs(cosT) * 1.4) + cosT * hh * 0.92;
      const py = cy + sinT * hh * 0.92;
      const spd = 0.22 + Math.random() * 0.24;
      this.floatBubbles.push({
        x: px,
        y: py,
        vx: cosT * spd * 1.15,
        vy: sinT * spd + 0.09,
        r: (i % 2 === 0 ? 0.0185 : 0.011) + Math.random() * 0.0055,
        dNm: 170 + Math.random() * 360,
        wobAmp: 0.26,
        wobPhase: Math.random() * Math.PI * 2,
        wobFreq: 18.0 + Math.random() * 7.0,
        driftPhase: Math.random() * Math.PI * 2,
        driftAmp: 0.036,
        buoyancy: 0.09,
        drag: 2.8,
        age: 0,
        life: 1.0,
        decay: 1.45 + Math.random() * 0.50,
      });
    }
  }

  _seedFilm() {
    const { nx, ny } = this;
    const ph = 0.65;
    for (let j = 0; j < ny; j++) {
      const v = j / (ny - 1);
      for (let i = 0; i < nx; i++) {
        const u = i / (nx - 1);
        const idx = j * nx + i;
        const wave = 0.22 * Math.sin(u * 6.5 + ph) * Math.sin(v * Math.PI)
                   + 0.16 * Math.cos(u * 4.2 - v * 3.8 + ph * 0.7);
        this.thick[idx] = Math.max(0.08, Math.min(0.92, 0.24 + (1.0 - v) * 0.42 + wave));
        this.z[idx] = 0;
        this.zPrev[idx] = 0;
        this.shimmer[idx] = 0.08;
        this.vx[idx] = Math.sin(v * Math.PI * 2 + ph) * 0.38;
        this.vy[idx] = Math.cos(u * Math.PI * 2.5 - ph) * 0.34;
      }
    }
    this._injectVortex(-0.22, 0.12, 0.36, 2.0);
    this._injectVortex(0.24, -0.14, 0.36, -2.0);
    for (let s = 0; s < 10; s++) this._stepFluid(0.025);
  }

  _injectVortex(lx, ly, radiusLocal, strength) {
    const gx = (lx * 0.5 + 0.5) * (this.nx - 1);
    const gy = (ly * 0.5 + 0.5) * (this.ny - 1);
    const rx = radiusLocal * 0.40 * this.nx;
    const ry = radiusLocal * 0.42 * this.ny;
    const i0 = Math.max(1, Math.floor(gx - rx * 1.8));
    const i1 = Math.min(this.nx - 2, Math.ceil(gx + rx * 1.8));
    const j0 = Math.max(1, Math.floor(gy - ry * 1.8));
    const j1 = Math.min(this.ny - 2, Math.ceil(gy + ry * 1.8));
    for (let j = j0; j <= j1; j++) {
      const dy = (j - gy) / Math.max(1, ry);
      for (let i = i0; i <= i1; i++) {
        const dx = (i - gx) / Math.max(1, rx);
        const w = Math.exp(-(dx * dx + dy * dy) * 2.4) * strength;
        const idx = j * this.nx + i;
        this.vx[idx] += -dy * w;
        this.vy[idx] += dx * w;
      }
    }
  }

  _impulseZ(ndcX, ndcY, amp, radiusNdc) {
    const gx = ((ndcX / 2.85) + 0.5) * (this.nx - 1);
    const gy = ((ndcY / 1.95) + 0.5) * (this.ny - 1);
    const rx = (radiusNdc / 2.85) * this.nx;
    const ry = (radiusNdc / 1.95) * this.ny;
    const i0 = Math.max(1, Math.floor(gx - rx * 2));
    const i1 = Math.min(this.nx - 2, Math.ceil(gx + rx * 2));
    const j0 = Math.max(1, Math.floor(gy - ry * 2));
    const j1 = Math.min(this.ny - 2, Math.ceil(gy + ry * 2));
    for (let j = j0; j <= j1; j++) {
      const dy = (j - gy) / Math.max(1, ry);
      for (let i = i0; i <= i1; i++) {
        const dx = (i - gx) / Math.max(1, rx);
        const w = Math.exp(-(dx * dx + dy * dy) * 2.2);
        const idx = j * this.nx + i;
        this.z[idx] += amp * w;
        this.shimmer[idx] = Math.min(1, this.shimmer[idx] + Math.abs(amp) * w * 1.15);
      }
    }
  }

  _stepFluid(h) {
    const { nx, ny, vx, vy, vxTmp, vyTmp, div, press, pressTmp, curl, thick, thickTmp } = this;
    const advScale = h * 7.6;

    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        curl[idx] = 0.5 * ((vy[idx + 1] - vy[idx - 1]) - (vx[idx + nx] - vx[idx - nx]));
      }
    }
    const vortAmp = 1.7 * h;
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

    const damp = Math.exp(-1.15 * h);
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

    const drain = 0.14 * h;
    for (let j = 0; j < ny; j++) {
      const v = j / (ny - 1);
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        let x = Math.max(0.001, Math.min(nx - 1.002, i - vx[idx] * advScale));
        let y = Math.max(0.001, Math.min(ny - 1.002, j - vy[idx] * advScale));
        const i0 = x | 0, j0 = y | 0;
        const fx = x - i0, fy = y - j0;
        const r0 = j0 * nx + i0, r1 = r0 + nx;
        let val =
          thick[r0] * (1 - fx) * (1 - fy) +
          thick[r0 + 1] * fx * (1 - fy) +
          thick[r1] * (1 - fx) * fy +
          thick[r1 + 1] * fx * fy;
        const strat = 0.22 + (1.0 - v) * 0.44;
        val += (strat - val) * drain;
        thickTmp[idx] = Math.max(0.05, Math.min(0.95, val));
      }
    }
    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        const avg = 0.25 * (thickTmp[idx - 1] + thickTmp[idx + 1] + thickTmp[idx - nx] + thickTmp[idx + nx]);
        thick[idx] = thickTmp[idx] + (avg - thickTmp[idx]) * 0.12;
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

    // 1. Advance popping animations & handle burst + neighbor foam recoil!
    for (let i = this.pills.length - 1; i >= 0; i--) {
      const p = this.pills[i];
      if (!p.popping) continue;
      p.popT += h;
      const popDur = 0.115;
      const pu = Math.min(1.0, p.popT / popDur);
      p.charge = pu * pu;
      p.hwCss = this.pillHw * (1.0 + 0.065 * pu);
      p.hhCss = this.pillHh * (1.0 + 0.14 * pu);
      p.wobPhase += (p.wobFreq + pu * 18) * h;
      p.wobAmp = 0.055 + pu * 0.075;

      if (p.popT >= popDur) {
        // POP! Spawn capsule rupture ring + radial 3D mist droplets
        if (this.popRings.length >= this.maxRings) this.popRings.shift();
        this.popRings.push({
          xCss: p.xCss,
          yCss: p.yCss,
          hwCss: p.hwCss,
          hhCss: p.hhCss,
          expandCss: 0,
          maxExpandCss: 48 * this.scale,
          t: 0,
          dur: 0.36,
          seed: Math.random() * 12.0,
        });
        this._spawnCapsulePopMist(p);
        this._impulseZ(this._toNdcX(p.xCss), this._toNdcY(p.yCss), 0.56, 0.42);
        this.audio?.playPop(0.90);

        // Give immediate neighbors authentic wall-release capillary recoil!
        if (i > 0) {
          const above = this.pills[i - 1];
          above.wobAmp = Math.max(above.wobAmp, 0.14);
          above.squashVel += 3.2; // flattened bottom snaps round!
          above.yVel -= 38 * this.scale; // tiny recoil lift before gliding into new equilibrium
          above.touchedBelow = false;
        }
        if (i < this.pills.length - 1) {
          const below = this.pills[i + 1];
          below.wobAmp = Math.max(below.wobAmp, 0.14);
          below.squashVel += 3.2; // flattened top snaps round!
          below.yVel += 38 * this.scale;
        }

        this.pills.splice(i, 1);
        this.onCountChange(this.pills.length);
      }
    }

    // 2. Foam stack equilibrium springs + Plateau wall contact cushion bounces!
    const n = this.pills.length;
    for (let i = 0; i < n; i++) {
      const p = this.pills[i];
      if (p.popping) continue;

      p.alpha = Math.min(1.0, p.alpha + h * 5.2);
      const isDragged = this.dragState && this.dragState.uid === p.uid;
      const isHov = (this.hoveredUid === p.uid) || isDragged;
      p.hoverMix += ((isHov ? 1 : 0) - p.hoverMix) * Math.min(1, h * 12);

      // Gentle buoyant living drift
      const swayX = Math.sin(this.time * 1.45 + p.swayPhase) * 2.4 * this.scale;
      const swayY = Math.cos(this.time * 1.75 + p.swayPhase * 0.8) * 1.15 * this.scale;

      const targetX = this.centerX + swayX;
      const targetY = this.centerY + (i - (n - 1) * 0.5) * this.stackDy + swayY;

      if (!isDragged) {
        p.xVel += ((targetX - p.xCss) * 175 - p.xVel * 15.5) * h;
        p.xCss += p.xVel * h;
      }

      // Snappy buoyant foam-stack convergence spring
      p.yVel += ((targetY - p.yCss) * 145 - p.yVel * 12.8) * h;
      p.yCss += p.yVel * h;

      // Subtle hover plumpness
      const targetHw = this.pillHw * (1.0 + p.hoverMix * 0.014);
      const targetHh = this.pillHh * (1.0 + p.hoverMix * 0.025);
      p.hwCss += (targetHw - p.hwCss) * Math.min(1, h * 14);
      p.hhCss += (targetHh - p.hhCss) * Math.min(1, h * 14);

      p.squashVel += ((0 - p.squash) * 220 - p.squashVel * 14.0) * h;
      p.squash += p.squashVel * h;

      p.wobPhase += p.wobFreq * h;
      p.wobAmp *= Math.exp(-3.8 * h);
    }

    // Detect newly formed Plateau wall contacts between adjacent pills -> cushion wobble + ripple + foley!
    for (let i = 0; i < n - 1; i++) {
      const a = this.pills[i];
      const b = this.pills[i + 1];
      if (a.popping || b.popping) continue;
      const dy = b.yCss - a.yCss;
      const dx = Math.abs(b.xCss - a.xCss);
      const touching = (dy < (a.hhCss + b.hhCss) - 1.5 * this.scale) && (dx < this.pillHw * 1.25);
      if (touching && !a.touchedBelow) {
        a.touchedBelow = true;
        a.wobAmp = Math.max(a.wobAmp, 0.095);
        b.wobAmp = Math.max(b.wobAmp, 0.105);
        a.squashVel -= 2.4;
        b.squashVel -= 2.8;
        // Cascade tiny compression wave down the lower pills
        for (let k = i + 2; k < n; k++) {
          this.pills[k].yVel += 42 * this.scale / (k - i);
          this.pills[k].wobAmp = Math.max(this.pills[k].wobAmp, 0.055);
        }
        this._impulseZ(this._toNdcX((a.xCss + b.xCss) * 0.5), this._toNdcY((a.yCss + b.yCss) * 0.5), 0.28, 0.30);
        this.audio?.playFoamTouch();
      } else if (!touching && dy > (a.hhCss + b.hhCss) + 4 * this.scale) {
        a.touchedBelow = false;
      }
    }

    // 3. Expanding capsule rupture rings
    for (let i = this.popRings.length - 1; i >= 0; i--) {
      const r = this.popRings[i];
      r.t += h;
      const u = Math.min(1.0, r.t / r.dur);
      r.expandCss = r.maxExpandCss * (1.0 - Math.pow(1.0 - u, 2.3));
      if (r.t >= r.dur) this.popRings.splice(i, 1);
    }

    // 4. Living ambient fluid & wave heightfield step
    this._injectVortex(Math.sin(this.time * 0.9) * 0.22, Math.cos(this.time * 1.1) * 0.18, 0.34, 0.38 * h * 12);
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
        shimmer[idx] *= Math.exp(-2.8 * h);
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

    // 5. Floating pop-mist micro-bubbles
    for (let i = this.floatBubbles.length - 1; i >= 0; i--) {
      const b = this.floatBubbles[i];
      b.age += h;
      const df = Math.exp(-b.drag * h);
      b.vx *= df;
      b.vy = b.vy * df + b.buoyancy * h;
      b.x += (b.vx + Math.sin(this.time * 2.6 + b.driftPhase) * b.driftAmp) * h;
      b.y += b.vy * h;
      b.wobPhase += b.wobFreq * h;
      b.wobAmp *= Math.exp(-3.0 * h);
      b.life -= b.decay * h;
      if (b.life <= 0) this.floatBubbles.splice(i, 1);
    }
  }

  _drawNotifIcon(ctx, id, cx, cy, s, strokeCol, lineW) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = strokeCol;
    ctx.fillStyle = strokeCol;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (id === 'calendar') {
      const w = s * 0.82, h = s * 0.78, r = s * 0.22;
      ctx.beginPath();
      ctx.roundRect(-w, -h * 0.82, w * 2, h * 1.72, r);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w, -h * 0.22);
      ctx.lineTo(w, -h * 0.22);
      ctx.moveTo(-w * 0.44, -h * 1.05);
      ctx.lineTo(-w * 0.44, -h * 0.58);
      ctx.moveTo(w * 0.44, -h * 1.05);
      ctx.lineTo(w * 0.44, -h * 0.58);
      ctx.stroke();
    } else if (id === 'chat') {
      ctx.beginPath();
      ctx.arc(0, -s * 0.06, s * 0.78, Math.PI * 0.78, Math.PI * 2.48, false);
      ctx.lineTo(-s * 0.72, s * 0.72);
      ctx.closePath();
      ctx.stroke();
    } else if (id === 'check') {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, s * 0.02);
      ctx.lineTo(-s * 0.08, s * 0.30);
      ctx.lineTo(s * 0.42, -s * 0.28);
      ctx.stroke();
    } else if (id === 'download') {
      ctx.beginPath();
      ctx.arc(0, s * 0.14, s * 0.84, Math.PI * 1.15, Math.PI * 1.85, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, s * 0.14, s * 0.50, Math.PI * 1.18, Math.PI * 1.82, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, s * 0.14, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, -s * 0.12, s * 0.54, Math.PI, 0, false);
      ctx.lineTo(s * 0.64, s * 0.46);
      ctx.lineTo(-s * 0.64, s * 0.46);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, s * 0.62, s * 0.16, 0, Math.PI, false);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawUnderContent() {
    const ctx = this.underCtx;
    const dpr = this.dpr;
    const W = this.underCanvas.width;
    const H = this.underCanvas.height;
    ctx.clearRect(0, 0, W, H);

    for (const p of this.pills) {
      const a = p.alpha * (1.0 - p.charge * 0.25);
      if (a <= 0.01) continue;

      const cx = p.xCss * dpr;
      const cy = p.yCss * dpr;
      const hw = p.hwCss * dpr;
      const sc = this.scale * dpr;

      ctx.save();
      ctx.globalAlpha = a;

      // Left subtle circular monochrome icon badge
      const badgeX = cx - hw + 28 * sc;
      const badgeR = 14.5 * sc;
      ctx.beginPath();
      ctx.arc(badgeX, cy, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(22, 24, 38, ${0.045 + p.hoverMix * 0.025})`;
      ctx.fill();

      this._drawNotifIcon(ctx, p.icon, badgeX, cy, 7.2 * sc, `rgba(22, 24, 38, ${0.78 + p.hoverMix * 0.16})`, 1.55 * sc);

      // Clean minimalist typography
      const textX = badgeX + 23 * sc;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${12.4 * sc}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(20, 22, 34, 0.90)';
      ctx.fillText(p.title, textX, cy - 7.4 * sc);

      ctx.font = `400 ${11.2 * sc}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(20, 22, 34, 0.54)';
      ctx.fillText(p.body, textX, cy + 8.0 * sc);

      // Right timestamp cleanly fades out before subtle '×' pop hint fades in (zero overlap!)
      const rightX = cx + hw - 22 * sc;
      const timeAlpha = Math.max(0, 1.0 - p.hoverMix / 0.45);
      if (timeAlpha > 0.01) {
        ctx.textAlign = 'right';
        ctx.font = `500 ${10.4 * sc}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
        ctx.fillStyle = `rgba(20, 22, 34, ${0.38 * timeAlpha})`;
        ctx.fillText(p.time, rightX, cy - 7.0 * sc);
      }
      const xAlpha = Math.max(0, (p.hoverMix - 0.50) / 0.50);
      if (xAlpha > 0.01) {
        const xm = rightX - 6 * sc;
        const arm = 3.8 * sc;
        ctx.strokeStyle = `rgba(22, 24, 38, ${0.52 * xAlpha})`;
        ctx.lineWidth = 1.45 * sc;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(xm - arm, cy - arm);
        ctx.lineTo(xm + arm, cy + arm);
        ctx.moveTo(xm + arm, cy - arm);
        ctx.lineTo(xm - arm, cy + arm);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  render() {
    this._drawUnderContent();

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

    this.pillBuf.fill(0);
    this.pillMetaBuf.fill(0);
    this.pillVisBuf.fill(0);
    const nP = Math.min(this.maxPills, this.pills.length);
    for (let i = 0; i < nP; i++) {
      const p = this.pills[i];
      const o = i * 4;
      this.pillBuf[o]     = this._toNdcX(p.xCss);
      this.pillBuf[o + 1] = this._toNdcY(p.yCss);
      this.pillBuf[o + 2] = this._pxToNdc(p.hwCss);
      this.pillBuf[o + 3] = this._pxToNdc(p.hhCss);

      this.pillMetaBuf[o]     = p.wobAmp;
      this.pillMetaBuf[o + 1] = p.wobPhase;
      this.pillMetaBuf[o + 2] = p.charge;
      this.pillMetaBuf[o + 3] = p.dNmSeed;

      this.pillVisBuf[o]     = p.alpha;
      this.pillVisBuf[o + 1] = p.hoverMix;
      this.pillVisBuf[o + 2] = p.squash;
      this.pillVisBuf[o + 3] = 0;
    }
    gl.uniform1i(u.uPillCount, nP);
    gl.uniform4fv(u.uPills, this.pillBuf);
    gl.uniform4fv(u.uPillMeta, this.pillMetaBuf);
    gl.uniform4fv(u.uPillVis, this.pillVisBuf);

    // Capsule pop rupture rings
    this.ringPosBuf.fill(0);
    this.ringInfoBuf.fill(0);
    const nR = Math.min(this.maxRings, this.popRings.length);
    for (let i = 0; i < nR; i++) {
      const r = this.popRings[i];
      const o = i * 4;
      const pu = r.t / r.dur;
      this.ringPosBuf[o]     = this._toNdcX(r.xCss);
      this.ringPosBuf[o + 1] = this._toNdcY(r.yCss);
      this.ringPosBuf[o + 2] = this._pxToNdc(r.hwCss);
      this.ringPosBuf[o + 3] = this._pxToNdc(r.hhCss);

      this.ringInfoBuf[o]     = this._pxToNdc(r.expandCss);
      this.ringInfoBuf[o + 1] = Math.pow(Math.max(0, 1.0 - pu), 1.5);
      this.ringInfoBuf[o + 2] = r.seed;
      this.ringInfoBuf[o + 3] = 0;
    }
    gl.uniform4fv(u.uPopPos, this.ringPosBuf);
    gl.uniform4fv(u.uPopInfo, this.ringInfoBuf);

    // Floating 3D pop-mist micro-bubbles
    this.dPosBuf.fill(0);
    this.dOptBuf.fill(0);
    const nD = Math.min(this.maxDaughters, this.floatBubbles.length);
    for (let i = 0; i < nD; i++) {
      const b = this.floatBubbles[i];
      const birthScale = Math.min(1.0, b.age / 0.04);
      const fadeA = Math.min(1.0, b.life * 3.5) * birthScale;
      const o = i * 4;
      this.dPosBuf[o] = b.x;
      this.dPosBuf[o + 1] = b.y;
      this.dPosBuf[o + 2] = b.r * (0.65 + 0.35 * birthScale);
      this.dPosBuf[o + 3] = fadeA;
      this.dOptBuf[o] = b.dNm;
      this.dOptBuf[o + 1] = b.wobAmp;
      this.dOptBuf[o + 2] = b.wobPhase;
      this.dOptBuf[o + 3] = b.age;
    }
    gl.uniform1i(u.uDaughterCount, nD);
    if (u.uDPos) gl.uniform4fv(u.uDPos, this.dPosBuf);
    if (u.uDOpt) gl.uniform4fv(u.uDOpt, this.dOptBuf);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
