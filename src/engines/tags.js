// ============================================================================
// SOAP FILM · DRAG-TO-MERGE TAG BUBBLES (COALESCE & TEAR-SPLIT)
// ============================================================================
// Floating filter tag bubbles (Design, Urgent, Audio, Saved) on pure white.
// Drag any bubble near another to bridge a glossy catenoid soap neck and fuse
// them into a larger volume-conserving combined group with swirled thin-film
// iridescence. Grab any tag inside a merged bubble and pull outward to stretch
// a catenoid neck and tear it cleanly free with floating 3D micro-droplets.

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

// Up to 5 simultaneous tag bubbles (4 tags + 1 active tearing child)
// uBubs[i]    = (cx, cy, r, wobAmp)
// uBubMeta[i] = (wobPhase, massNorm 0..1, stretchAmt 0..1, stretchAngleRad)
// uBubVis[i]  = (hoverMix 0..1, dragMix 0..1, dNmSeed, 0)
#define MAX_BUBS 5
uniform int uBubCount;
uniform vec4 uBubs[MAX_BUBS];
uniform vec4 uBubMeta[MAX_BUBS];
uniform vec4 uBubVis[MAX_BUBS];

// Active liquid bridge pair (during drag-merge approach OR tear-split extrusion)
// uBridge = (idxA, idxB, kNdc, 0)
uniform vec4 uBridge;
uniform float uActivity;

// Delicate 3D WebGL2 satellite micro-droplets shed on tear-split pinch-off
#define MAX_DAUGHTERS 12
uniform int uDaughterCount;
uniform vec4 uDPos[MAX_DAUGHTERS];
uniform vec4 uDOpt[MAX_DAUGHTERS];

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

vec3 bubbleSpeculars(vec3 N, float NdotV, vec2 pNorm, float time, float starBoost) {
  vec3 V = vec3(0.0, 0.0, 1.0);

  vec3 L1 = normalize(vec3(-0.56, 0.78, 0.48));
  vec3 H1 = normalize(L1 + V);
  float ndh1 = max(0.0, dot(N, H1));
  float arc1 = smoothstep(0.86, 0.945, ndh1) * 0.72 + smoothstep(0.96, 0.992, ndh1) * 0.92;

  vec3 L2 = normalize(vec3(0.68, -0.56, 0.44));
  vec3 H2 = normalize(L2 + V);
  float ndh2 = max(0.0, dot(N, H2));
  float arc2 = smoothstep(0.88, 0.96, ndh2) * 0.48;

  float skyArc = smoothstep(0.24, 0.90, -pNorm.x * 0.55 + pNorm.y * 0.85) * smoothstep(0.18, 0.80, 1.0 - NdotV) * 0.24;

  vec2 starCenter = vec2(-0.44, 0.52);
  vec2 dStar = (pNorm - starCenter) * 3.5;
  float rStar = length(dStar);
  float rayH = exp(-abs(dStar.y) * 26.0) * exp(-abs(dStar.x) * 4.0);
  float rayV = exp(-abs(dStar.x) * 26.0) * exp(-abs(dStar.y) * 4.0);
  vec2 dDiag = vec2(dStar.x + dStar.y, dStar.x - dStar.y) * 0.7071;
  float rayD = (exp(-abs(dDiag.y) * 34.0) * exp(-abs(dDiag.x) * 7.0)
              + exp(-abs(dDiag.x) * 34.0) * exp(-abs(dDiag.y) * 7.0)) * 0.50;
  float coreDot = exp(-rStar * rStar * 22.0);
  float twinkle = 0.82 + 0.18 * sin(time * (4.6 + starBoost * 4.5) + pNorm.x * 2.0);
  float starburst = (coreDot * 0.96 + (rayH + rayV + rayD) * smoothstep(0.82, 0.0, rStar) * 0.86)
                  * twinkle * smoothstep(0.35, 0.80, ndh1 + 0.20) * starBoost;

  return vec3(clamp(arc1 + arc2 + skyArc + starburst, 0.0, 1.50), skyArc, starburst);
}

vec4 over(vec4 src, vec4 dst) {
  return vec4(src.rgb + dst.rgb * (1.0 - src.a), src.a + dst.a * (1.0 - src.a));
}

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
// FREE-FLOATING TAG BUBBLES COMPOUND SDF (C-INFINITY SEAMLESS LIQUID BRIDGES)
// ============================================================================
float sdSingleTagBubble(vec2 p, vec4 bub, vec4 meta) {
  float r = max(0.012, bub.z);
  vec2 bp = p - bub.xy;
  float stretch = 1.0 + clamp(meta.z, 0.0, 1.0) * 0.18;
  vec2 dir = vec2(cos(meta.w), sin(meta.w));
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 local = vec2(dot(bp, dir) / stretch, dot(bp, perp) * sqrt(stretch));
  float baseD = (length(local) - r) * sqrt(stretch);

  float ang = atan(bp.y, bp.x);
  float rNorm = length(bp) / r;
  float wobFade = smoothstep(0.08, 0.46, rNorm);
  float ph = meta.x;
  float wob = bub.w * (0.72 * cos(2.0 * ang + ph) + 0.28 * sin(3.0 * ang - ph * 1.35)) * r * wobFade;
  float breath = 0.0022 * sin(2.0 * ang + uTime * 2.1 + ph * 0.4) * wobFade;
  return baseD - wob - breath;
}

float sdTagSoap(
  vec2 p,
  out vec2 outSmoothCenter,
  out float outSmoothR,
  out float outMassMix,
  out float outHovMix,
  out float outBridgeF
) {
  float d[MAX_BUBS];
  float dMin = 10.0;
  for (int i = 0; i < MAX_BUBS; i++) {
    if (i < uBubCount && uBubs[i].z > 0.01) {
      d[i] = sdSingleTagBubble(p, uBubs[i], uBubMeta[i]);
      dMin = min(dMin, d[i]);
    } else {
      d[i] = 10.0;
    }
  }

  // C-infinity softmax blending -> ZERO Voronoi color or normal seams across liquid bridges!
  vec2 cSum = vec2(0.0);
  float rSum = 0.0;
  float mSum = 0.0;
  float hSum = 0.0;
  float wSum = 0.0;
  for (int i = 0; i < MAX_BUBS; i++) {
    if (i >= uBubCount || uBubs[i].z <= 0.01) continue;
    float wi = exp(-max(0.0, d[i] - dMin) * 15.0);
    cSum += uBubs[i].xy * wi;
    rSum += uBubs[i].z * wi;
    mSum += uBubMeta[i].y * wi;
    hSum += max(uBubVis[i].x, uBubVis[i].y) * wi;
    wSum += wi;
  }
  float invW = 1.0 / max(1e-5, wSum);
  outSmoothCenter = cSum * invW;
  outSmoothR = rSum * invW;
  outMassMix = mSum * invW;
  outHovMix = hSum * invW;

  float dTotal = dMin;
  outBridgeF = 0.0;

  // Selective analytical smooth-min catenoid liquid bridge between active merging or tearing pair!
  int idxA = int(uBridge.x + 0.5);
  int idxB = int(uBridge.y + 0.5);
  float kk = uBridge.z;
  if (kk > 0.002 && idxA >= 0 && idxB >= 0 && idxA < uBubCount && idxB < uBubCount && idxA != idxB) {
    float dA = d[idxA];
    float dB = d[idxB];
    float dPair = smin(dA, dB, kk);
    float sep = max(0.0, dA + dB);
    float neckBand = exp(-abs(dA - dB) / max(0.026, kk * 0.72))
                   * smoothstep(0.002, 0.055, kk)
                   * smoothstep(kk * 0.74, kk * 0.20, sep);
    dTotal = min(dTotal, dPair);
    outBridgeF = neckBand;
  }

  return dTotal;
}

void main() {
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2((vUv.x * 2.0 - 1.0) * aspect, (vUv.y * 2.0 - 1.0));
  float px = 2.0 / uSize.y;

  vec4 outCol = vec4(0.0);

  if (uBubCount > 0 && abs(p.x) < 1.72 && abs(p.y) < 0.96) {
    vec2 smoothC;
    float smoothR, massMix, hovMix, bridgeF;
    float sdBubble = sdTagSoap(p, smoothC, smoothR, massMix, hovMix, bridgeF);

    // --- 1. SEAMLESS AIRY FLOATING SHADOWS ---
    {
      float shAcc = 0.0;
      for (int i = 0; i < MAX_BUBS; i++) {
        if (i >= uBubCount) break;
        float r = uBubs[i].z;
        if (r <= 0.01) continue;
        float m = uBubMeta[i].y;
        float drag = uBubVis[i].y;
        vec2 shPos = uBubs[i].xy + vec2(0.015 + 0.010 * drag, -(0.044 + 0.018 * m + 0.020 * drag));
        float rSh = r * (1.26 + 0.12 * m + 0.08 * drag);
        float dSh = length(p - shPos);
        if (dSh < rSh * 1.45) {
          float s = smoothstep(rSh * 1.35, r * 0.18, dSh) * (0.036 + 0.020 * m + 0.014 * drag);
          shAcc = max(shAcc, s);
        }
      }
      if (shAcc > 0.001) {
        outCol = over(vec4(vec3(0.24, 0.26, 0.44) * shAcc, shAcc), outCol);
      }
    }

    // --- 2. 3D VOLUMETRIC IRIDESCENT TAG BUBBLES + SEAMLESS CATENOID BRIDGES ---
    float orbMask = smoothstep(px * 1.75, -px * 1.75, sdBubble);
    if (orbMask > 0.001) {
      float eps = 0.004;
      vec2 dC;
      float dR, dM, dH, dB;
      vec2 rawGrad = vec2(
        sdTagSoap(p + vec2(eps, 0.0), dC, dR, dM, dH, dB) - sdTagSoap(p - vec2(eps, 0.0), dC, dR, dM, dH, dB),
        sdTagSoap(p + vec2(0.0, eps), dC, dR, dM, dH, dB) - sdTagSoap(p - vec2(0.0, eps), dC, dR, dM, dH, dB)
      ) / (2.0 * eps);
      float gradLen = length(rawGrad);
      vec2 gSmooth = rawGrad / sqrt(dot(rawGrad, rawGrad) + 0.025);

      float dIn = max(0.0, -sdBubble);
      float scaleSafe = max(0.022, mix(smoothR, max(0.038, smoothR * 0.62), bridgeF * 0.65));
      float normDepth = clamp(dIn / scaleSafe, 0.0, 1.0);
      float rho = 1.0 - normDepth;
      vec2 pNorm = (p - smoothC) / max(vec2(smoothR), vec2(0.05));

      // Live 2D Navier-Stokes Marangoni swirling fluid
      vec2 simUv = clamp((p / vec2(3.30, 1.90)) + 0.5, 0.004, 0.996);
      vec2 texel = 1.0 / vec2(textureSize(uSim, 0));
      vec4 simC = texture(uSim, simUv);
      float zL = texture(uSim, simUv - vec2(texel.x, 0.0)).g;
      float zR = texture(uSim, simUv + vec2(texel.x, 0.0)).g;
      float zD = texture(uSim, simUv - vec2(0.0, texel.y)).g;
      float zU = texture(uSim, simUv + vec2(0.0, texel.y)).g;
      float rimZone = smoothstep(0.18, 0.85, max(rho, bridgeF));
      vec2 gradZRaw = vec2(zR - zL, zU - zD) * 3.8 * (0.24 + 0.76 * rimZone);
      vec2 gradZ = gradZRaw / (1.0 + length(gradZRaw) * 2.4);

      vec2 swirlTilt = (0.024 + 0.036 * massMix + 0.048 * bridgeF) * vec2(
        sin(p.y * 12.5 + p.x * 4.0 + uTime * 2.4),
        cos(p.x * 11.0 - p.y * 4.6 - uTime * 2.1)
      ) * (0.35 + 0.65 * rimZone);

      float saddleFlat = clamp(gradLen, 0.0, 1.0);
      float domeR = mix(rho, rho * saddleFlat, bridgeF * 0.72);
      float rimSteep = pow(clamp(domeR, 1e-4, 0.995), 1.32) * (0.88 + 0.12 * massMix + 0.06 * bridgeF);

      vec2 nXY = gSmooth * rimSteep + swirlTilt - gradZ;
      float nXY2 = dot(nXY, nXY);
      vec3 N = normalize(vec3(nXY, sqrt(max(0.06, 1.0 - min(0.94, nXY2)))));
      vec3 V = vec3(0.0, 0.0, 1.0);
      float NdotV = clamp(dot(N, V), 0.06, 1.0);
      float slopeMag = length(gradZ);

      float fres = pow(max(1e-4, 1.0 - NdotV), 2.18);
      float razorRim = pow(max(1e-4, 1.0 - NdotV), 4.7);

      float rimOff = max(0.045, min(0.18, px * 1.25 / scaleSafe));
      float ioArg = (normDepth - rimOff) / max(0.034, rimOff * 0.70);
      float innerOutline = exp(-(ioArg * ioArg));
      float hairOff = min(0.042, px * 0.52 / scaleSafe);
      float owArg = (normDepth - hairOff) / max(0.022, px * 0.55 / scaleSafe);
      float outerWhiteHair = exp(-(owArg * owArg));

      // World-space continuous swirled thin-film thickness (ZERO seam across liquid necks!)
      float flowWave = 0.5 + 0.5 * sin(p.x * 4.0 - p.y * 5.6 + simC.r * 3.8 + uTime * (0.90 + 1.6 * uActivity));
      float dNmBase = mix(145.0, 745.0, simC.r * 0.68 + flowWave * 0.32);
      float dNm = dNmBase + p.x * 92.0 - p.y * 58.0 + fres * 235.0 + bridgeF * 160.0 + massMix * 55.0;

      float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
      float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
      vec3 irid = bubbleIridescence(dNm, cosTheta);

      float starBoost = (0.24 + 0.72 * max(massMix, hovMix)) * (1.0 - smoothstep(0.10, 0.55, bridgeF));
      vec3 specInfo = bubbleSpeculars(N, NdotV, pNorm, uTime, starBoost);
      float specArc = specInfo.x * (0.30 + 0.70 * rimZone) * (1.0 - bridgeF * 0.42);

      vec2 spGrid = (p + vec2(simC.r * 0.30, -simC.g * 0.24)) * 22.0;
      vec2 spCell = floor(spGrid);
      vec2 spF = fract(spGrid) - 0.5;
      float spRnd = hash21(spCell);
      float spDot = smoothstep(0.15, 0.02, length(spF)) * step(0.945 - (massMix * 0.02 + bridgeF * 0.025), spRnd)
                  * (0.45 + 0.55 * sin(uTime * 6.0 + spRnd * 40.0))
                  * (0.28 + 0.65 * fres + simC.b + bridgeF * 0.48);

      float chromaRich = 0.74 + 0.26 * max(max(massMix, hovMix), bridgeF);
      vec3 contourCol = mix(vec3(0.36, 0.40, 0.66), irid * 0.66 + vec3(0.18, 0.16, 0.36), 0.52);
      vec3 domeColor = mix(vec3(0.95, 0.97, 1.0), irid * 0.95 + vec3(0.14, 0.17, 0.25), 0.90 * chromaRich);

      vec3 col = mix(vec3(0.97, 0.98, 1.0), domeColor, clamp(0.10 + fres * 0.84 + bridgeF * 0.38 + slopeMag * 0.36 + massMix * 0.14, 0.0, 1.0));
      col = mix(col, contourCol, clamp(innerOutline * (0.48 + 0.14 * massMix) + razorRim * 0.45 + bridgeF * 0.14, 0.0, 0.84));
      float crescentBand = smoothstep(0.08, 0.74, max(fres, bridgeF * 0.68)) * (1.0 - outerWhiteHair * 0.60);
      col = mix(col, clamp(irid * 1.15 + vec3(0.08, 0.07, 0.13), 0.0, 1.0), crescentBand * (0.60 + 0.18 * max(massMix, bridgeF)));
      col = mix(col, vec3(1.0, 0.998, 1.0), clamp(specArc * 0.92 + outerWhiteHair * 0.84 + spDot * 0.85, 0.0, 0.99));

      float rimAlpha = innerOutline * (0.46 + 0.16 * massMix) + outerWhiteHair * 0.74 + razorRim * 0.54;
      // Keep tag center translucent-clear so monochrome tag typography reads razor crisp!
      float alpha = clamp(
        0.022 + fres * (0.64 + 0.16 * max(massMix, hovMix)) + rimAlpha + specArc * 0.78 + bridgeF * 0.28 + slopeMag * 0.14 + spDot * 0.52,
        0.0,
        0.95
      );

      vec4 bubLayer = vec4(col * (alpha * orbMask), alpha * orbMask);
      outCol = over(bubLayer, outCol);
    }
  }

  // --- 3. 3D WEBGL2 SATELLITE MICRO-DROPLETS ON TEAR-SPLIT PINCH-OFF ---
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

const DEFAULT_TAGS = [
  { id: 'design', label: 'Design', dot: '#5B6CF6' },
  { id: 'urgent', label: 'Urgent', dot: '#EE5A6F' },
  { id: 'audio',  label: 'Audio',  dot: '#1FB6A6' },
  { id: 'saved',  label: 'Saved',  dot: '#E69F24' },
];

class SoapTagBubbles {
  constructor(container, opts = {}) {
    this.width = opts.width || 640;
    this.height = opts.height || 360;
    this.aspect = this.width / this.height;
    this.dpr = opts.dpr || 2;
    this.audio = opts.audio || null;
    this.onChange = opts.onChange || (() => {});
    this.tags = opts.tags || null;

    const scale = Math.min(1.0, (this.width - 28) / 480, (this.height - 24) / 320);
    this.scale = scale;

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

    // 2D Navier-Stokes fluid grid (72x44)
    this.nx = 72;
    this.ny = 44;
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

    this.maxBubs = 5;
    this.maxDaughters = 12;
    this.bubBuf = new Float32Array(this.maxBubs * 4);
    this.bubMetaBuf = new Float32Array(this.maxBubs * 4);
    this.bubVisBuf = new Float32Array(this.maxBubs * 4);
    this.dPosBuf = new Float32Array(this.maxDaughters * 4);
    this.dOptBuf = new Float32Array(this.maxDaughters * 4);

    this.nextUid = 1;
    this.reset();
  }

  _toNdcX(cx) { return (cx / this.width * 2 - 1) * this.aspect; }
  _toNdcY(cy) { return 1 - (cy / this.height * 2); }
  _pxToNdc(px) { return px * (2 / this.height); }

  _radiusForCount(n) {
    const table = [0, 38.0, 51.5, 61.0, 68.5];
    return table[Math.max(1, Math.min(4, n))] * this.scale;
  }

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
    for (const n of ['uSim', 'uRes', 'uSize', 'uTime', 'uBubCount', 'uBridge', 'uActivity', 'uDaughterCount']) {
      this.u[n] = gl.getUniformLocation(this.prog, n);
    }
    this.u.uBubs = gl.getUniformLocation(this.prog, 'uBubs') || gl.getUniformLocation(this.prog, 'uBubs[0]');
    this.u.uBubMeta = gl.getUniformLocation(this.prog, 'uBubMeta') || gl.getUniformLocation(this.prog, 'uBubMeta[0]');
    this.u.uBubVis = gl.getUniformLocation(this.prog, 'uBubVis') || gl.getUniformLocation(this.prog, 'uBubVis[0]');
    this.u.uDPos = gl.getUniformLocation(this.prog, 'uDPos') || gl.getUniformLocation(this.prog, 'uDPos[0]');
    this.u.uDOpt = gl.getUniformLocation(this.prog, 'uDOpt') || gl.getUniformLocation(this.prog, 'uDOpt[0]');
  }

  _makeCluster(tags, xCss, yCss) {
    const r = this._radiusForCount(tags.length);
    return {
      uid: this.nextUid++,
      tags: tags.map((t) => ({ ...t })),
      xCss,
      yCss,
      homeX: xCss,
      homeY: yCss,
      vx: 0,
      vy: 0,
      rCss: r,
      rVel: 0,
      wobAmp: 0,
      wobPhase: this.nextUid * 1.4,
      wobFreq: 13.5 + (this.nextUid % 4) * 0.7,
      bobPhase: this.nextUid * 1.65,
      hoverMix: 0,
      dragMix: 0,
      stretch: 0,
      stretchAngNdc: 0,
    };
  }

  reset() {
    this.time = 1.0;
    this.hoveredUid = -1;
    this.hoveredRow = -1;
    this.drag = null; // { mode: 'drag'|'split_pending'|'splitting', uid, parentUid, tagIdx, grabOffX, grabOffY, startX, startY }
    this.bridge = { idxA: -1, idxB: -1, k: 0, targetK: 0 };
    this.activity = 0;

    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const dx = 104 * this.scale;
    const dy = 58 * this.scale;
    const starts = [
      { x: cx - dx * 1.05, y: cy - dy * 0.82 }, // Design (top-left)
      { x: cx + dx * 0.98, y: cy - dy * 0.92 }, // Urgent (top-right)
      { x: cx - dx * 0.88, y: cy + dy * 1.02 }, // Audio  (bottom-left)
      { x: cx + dx * 1.04, y: cy + dy * 0.94 }, // Saved  (bottom-right)
    ];

    this.clusters = (this.tags || DEFAULT_TAGS).slice(0, 4).map((t, i) => this._makeCluster([t], starts[i].x, starts[i].y));
    this.floatBubbles = [];
    this._seedFilm();
    this.onChange(this.clusters);
  }

  tagPos(tagId) {
    for (const c of this.clusters) {
      const idx = c.tags.findIndex((t) => t.id === tagId);
      if (idx >= 0) {
        const rowH = 19.5 * this.scale;
        const yOff = (idx - (c.tags.length - 1) * 0.5) * rowH;
        return { x: c.xCss, y: c.yCss + yOff, cluster: c, rowIdx: idx };
      }
    }
    return { x: this.width * 0.5, y: this.height * 0.5, cluster: null, rowIdx: -1 };
  }

  hitTest(sx, sy) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.clusters) {
      const d = Math.hypot(sx - c.xCss, sy - c.yCss);
      if (d <= c.rCss + 8 && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (!best) return { uid: -1, rowIdx: -1 };
    let rowIdx = 0;
    if (best.tags.length >= 2) {
      const rowH = 19.5 * this.scale;
      let bestRowD = Infinity;
      for (let i = 0; i < best.tags.length; i++) {
        const ry = best.yCss + (i - (best.tags.length - 1) * 0.5) * rowH;
        const rd = Math.abs(sy - ry);
        if (rd < bestRowD) { bestRowD = rd; rowIdx = i; }
      }
    }
    return { uid: best.uid, rowIdx };
  }

  setHovered(sx, sy) {
    if (this.drag) return;
    const h = this.hitTest(sx, sy);
    if (h.uid !== this.hoveredUid && h.uid >= 0) {
      const c = this.clusters.find((q) => q.uid === h.uid);
      if (c) c.wobAmp = Math.max(c.wobAmp, 0.042);
    }
    this.hoveredUid = h.uid;
    this.hoveredRow = h.rowIdx;
  }

  clearHover() {
    this.hoveredUid = -1;
    this.hoveredRow = -1;
  }

  pointerDown(sx, sy) {
    const h = this.hitTest(sx, sy);
    if (h.uid < 0) return false;
    const c = this.clusters.find((q) => q.uid === h.uid);
    if (!c) return false;
    this.audio?.unlock();
    c.wobAmp = Math.max(c.wobAmp, 0.06);
    this.hoveredUid = h.uid;
    this.hoveredRow = h.rowIdx;

    if (c.tags.length >= 2) {
      // Grabbing a specific tag row inside a merged group prepares a tactile tear-split!
      this.drag = {
        mode: 'split_pending',
        parentUid: c.uid,
        uid: c.uid,
        tagIdx: h.rowIdx,
        startX: sx,
        startY: sy,
        grabOffX: c.xCss - sx,
        grabOffY: c.yCss - sy,
      };
    } else {
      this.drag = {
        mode: 'drag',
        uid: c.uid,
        parentUid: -1,
        tagIdx: 0,
        startX: sx,
        startY: sy,
        grabOffX: c.xCss - sx,
        grabOffY: c.yCss - sy,
      };
    }
    this.audio?.playTap(660);
    return true;
  }

  pointerMove(sx, sy) {
    if (!this.drag) {
      this.setHovered(sx, sy);
      return;
    }

    if (this.drag.mode === 'split_pending') {
      const distMoved = Math.hypot(sx - this.drag.startX, sy - this.drag.startY);
      if (distMoved > 10 * this.scale) {
        const parent = this.clusters.find((q) => q.uid === this.drag.parentUid);
        if (!parent || parent.tags.length < 2) { this.drag = null; return; }
        // Extrude the grabbed tag straight out of the merged parent bubble!
        const [pulledTag] = parent.tags.splice(this.drag.tagIdx, 1);
        const child = this._makeCluster([pulledTag], sx, sy);
        child.rCss = this._radiusForCount(1) * 0.62; // emerges plumply from parent's skin
        child.wobAmp = 0.09;
        parent.wobAmp = Math.max(parent.wobAmp, 0.085);
        this.clusters.push(child);

        this.drag = {
          mode: 'splitting',
          parentUid: parent.uid,
          uid: child.uid,
          tagIdx: 0,
          startX: this.drag.startX,
          startY: this.drag.startY,
          // Keep pointer offset slightly below-right so the tag label stays readable while pulling!
          grabOffX: -12 * this.scale,
          grabOffY: -12 * this.scale,
        };
        this.onChange(this.clusters);
      }
      return;
    }

    const active = this.clusters.find((q) => q.uid === this.drag.uid);
    if (!active) { this.drag = null; return; }

    const pad = active.rCss + 12 * this.scale;
    const nx = Math.max(pad, Math.min(this.width - pad, sx + this.drag.grabOffX));
    const ny = Math.max(pad, Math.min(this.height - pad, sy + this.drag.grabOffY));

    const dvx = nx - active.xCss;
    const dvy = ny - active.yCss;
    active.xCss = nx;
    active.yCss = ny;
    active.homeX = nx;
    active.homeY = ny;
    active.vx = dvx * 16;
    active.vy = dvy * 16;

    // Stir Marangoni fluid softly behind dragged bubble
    if (Math.hypot(dvx, dvy) > 0.6) {
      this._injectJet(this._toNdcX(nx), this._toNdcY(ny), dvx * 0.12, -dvy * 0.12);
    }

    if (this.drag.mode === 'splitting') {
      const parent = this.clusters.find((q) => q.uid === this.drag.parentUid);
      if (!parent) { this.drag.mode = 'drag'; return; }
      const d = Math.hypot(active.xCss - parent.xCss, active.yCss - parent.yCss);
      const snapDist = (this._radiusForCount(parent.tags.length) + this._radiusForCount(1)) * 1.46;
      if (d >= snapDist) {
        // SNAP!! Catenoid neck tears cleanly free right in mid-air!
        this._spawnPinchDroplets(parent, active);
        parent.wobAmp = Math.max(parent.wobAmp, 0.13);
        active.wobAmp = Math.max(active.wobAmp, 0.14);
        this._impulseZ(this._toNdcX((parent.xCss + active.xCss) * 0.5), this._toNdcY((parent.yCss + active.yCss) * 0.5), 0.18, 0.28);
        this.audio?.playTagSplit();
        this.drag.mode = 'drag';
        this.drag.parentUid = -1;
        this.bridge.k = 0;
        this.bridge.targetK = 0;
      }
    } else if (this.drag.mode === 'drag') {
      // Check if dragged bubble crossed deep into another cluster -> immediate liquid coalescence!
      const target = this._findNearestOther(active);
      if (target) {
        const d = Math.hypot(active.xCss - target.xCss, active.yCss - target.yCss);
        if (d < (active.rCss + target.rCss) * 0.64) {
          this._mergeClusters(active, target);
          this.drag = null;
        }
      }
    }
  }

  pointerUp() {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;

    if (d.mode === 'splitting') {
      const parent = this.clusters.find((q) => q.uid === d.parentUid);
      const child = this.clusters.find((q) => q.uid === d.uid);
      if (parent && child) {
        const dist = Math.hypot(child.xCss - parent.xCss, child.yCss - parent.yCss);
        if (dist >= (parent.rCss + child.rCss) * 0.84) {
          // Pulled far enough -> snap free cleanly!
          this._spawnPinchDroplets(parent, child);
          parent.wobAmp = Math.max(parent.wobAmp, 0.14);
          child.wobAmp = Math.max(child.wobAmp, 0.15);
          this.audio?.playTagSplit();
          this.bridge.k = 0;
        } else {
          // Released early -> snap child right back into parent!
          this._mergeClusters(child, parent);
        }
      }
    } else if (d.mode === 'drag') {
      const active = this.clusters.find((q) => q.uid === d.uid);
      if (active) {
        const target = this._findNearestOther(active);
        if (target) {
          const gap = Math.hypot(active.xCss - target.xCss, active.yCss - target.yCss) - (active.rCss + target.rCss);
          if (gap < 18 * this.scale) {
            this._mergeClusters(active, target);
          }
        }
      }
    }
  }

  splitCluster(uid) {
    const parent = this.clusters.find((q) => q.uid === uid);
    if (!parent || parent.tags.length < 2) return;
    this.audio?.unlock();
    const pulled = parent.tags.pop();
    const ang = (Math.random() - 0.5) * 0.8;
    const dirX = parent.xCss > this.width * 0.5 ? -1 : 1;
    const child = this._makeCluster([pulled], parent.xCss + dirX * 92 * this.scale, parent.yCss + Math.sin(ang) * 32 * this.scale);
    child.xCss = parent.xCss + dirX * 36 * this.scale;
    child.vx = dirX * 220 * this.scale;
    child.wobAmp = 0.15;
    parent.wobAmp = 0.14;
    this.clusters.push(child);
    this._spawnPinchDroplets(parent, child);
    this.audio?.playTagSplit();
    this.onChange(this.clusters);
  }

  _findNearestOther(c) {
    let best = null;
    let bestD = Infinity;
    for (const o of this.clusters) {
      if (o.uid === c.uid) continue;
      const d = Math.hypot(o.xCss - c.xCss, o.yCss - c.yCss);
      if (d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  _mergeClusters(src, dst) {
    const wSrc = src.tags.length;
    const wDst = dst.tags.length;
    const mx = (src.xCss * wSrc + dst.xCss * wDst) / (wSrc + wDst);
    const my = (src.yCss * wSrc + dst.yCss * wDst) / (wSrc + wDst);

    for (const t of src.tags) dst.tags.push(t);
    dst.xCss = dst.xCss * 0.45 + mx * 0.55;
    dst.yCss = dst.yCss * 0.45 + my * 0.55;
    dst.homeX = dst.xCss;
    dst.homeY = dst.yCss;
    dst.wobAmp = Math.max(dst.wobAmp, 0.135);
    dst.rVel += 52 * this.scale; // juicy coalescence inflation bounce!

    // Vivid opposing vortex swirl in the 2D Navier-Stokes fluid right at merge center!
    const ndcX = this._toNdcX(mx);
    const ndcY = this._toNdcY(my);
    this._injectVortex(ndcX / 1.65, ndcY / 0.95, 0.36, 3.2);
    this._impulseZ(ndcX, ndcY, 0.16, 0.34);

    const idx = this.clusters.indexOf(src);
    if (idx >= 0) this.clusters.splice(idx, 1);

    this.bridge.k = 0;
    this.bridge.targetK = 0;
    this.audio?.playTagMerge(dst.tags.length);
    this.onChange(this.clusters);
  }

  _spawnPinchDroplets(a, b) {
    const midX = this._toNdcX((a.xCss + b.xCss) * 0.5);
    const midY = this._toNdcY((a.yCss + b.yCss) * 0.5);
    const dx = this._toNdcX(b.xCss) - this._toNdcX(a.xCss);
    const dy = this._toNdcY(b.yCss) - this._toNdcY(a.yCss);
    const len = Math.hypot(dx, dy) + 1e-5;
    const px = -dy / len;
    const py = dx / len;

    for (let s = 0; s < 2; s++) {
      if (this.floatBubbles.length >= this.maxDaughters) this.floatBubbles.shift();
      const side = s === 0 ? 1 : -1;
      this.floatBubbles.push({
        x: midX + px * side * 0.032 + (Math.random() - 0.5) * 0.015,
        y: midY + py * side * 0.032 + 0.02,
        vx: px * side * (0.09 + Math.random() * 0.07),
        vy: py * side * 0.06 + 0.20 + Math.random() * 0.10,
        r: s === 0 ? (0.021 + Math.random() * 0.006) : (0.012 + Math.random() * 0.005),
        dNm: 200 + Math.random() * 300,
        wobAmp: 0.24,
        wobPhase: Math.random() * Math.PI * 2,
        wobFreq: 17.0 + Math.random() * 6.0,
        driftPhase: Math.random() * Math.PI * 2,
        driftAmp: 0.035,
        buoyancy: 0.13,
        drag: 2.5,
        age: 0,
        life: 1.0,
        decay: 1.25 + Math.random() * 0.45,
      });
    }
  }

  _seedFilm() {
    const { nx, ny } = this;
    const ph = 0.80;
    for (let j = 0; j < ny; j++) {
      const v = j / (ny - 1);
      for (let i = 0; i < nx; i++) {
        const u = i / (nx - 1);
        const idx = j * nx + i;
        const wave = 0.23 * Math.sin(u * 7.0 + ph) * Math.sin(v * Math.PI)
                   + 0.16 * Math.cos(u * 4.2 - v * 3.5 + ph * 0.7);
        this.thick[idx] = Math.max(0.08, Math.min(0.92, 0.24 + (1.0 - v) * 0.42 + wave));
        this.z[idx] = 0;
        this.zPrev[idx] = 0;
        this.shimmer[idx] = 0.08;
        this.vx[idx] = Math.sin(v * Math.PI * 2 + ph) * 0.40;
        this.vy[idx] = Math.cos(u * Math.PI * 2.5 - ph) * 0.35;
      }
    }
    this._injectVortex(-0.32, 0.15, 0.36, 2.2);
    this._injectVortex(0.32, -0.15, 0.36, -2.2);
    for (let s = 0; s < 12; s++) this._stepFluid(0.025);
  }

  _injectJet(ndcX, ndcY, dirX, dirY) {
    const { nx, ny, vx, vy, thick, shimmer } = this;
    const gx = ((ndcX / 3.30) + 0.5) * (nx - 1);
    const gy = ((ndcY / 1.90) + 0.5) * (ny - 1);
    const rx = nx * 0.14;
    const ry = ny * 0.20;
    const i0 = Math.max(1, Math.floor(gx - rx * 2));
    const i1 = Math.min(nx - 2, Math.ceil(gx + rx * 2));
    const j0 = Math.max(1, Math.floor(gy - ry * 2));
    const j1 = Math.min(ny - 2, Math.ceil(gy + ry * 2));
    for (let j = j0; j <= j1; j++) {
      const dy = (j - gy) / ry;
      for (let i = i0; i <= i1; i++) {
        const dx = (i - gx) / rx;
        const w = Math.exp(-(dx * dx + dy * dy) * 1.9);
        if (w < 0.02) continue;
        const idx = j * nx + i;
        vx[idx] += dirX * w * 2.2;
        vy[idx] += dirY * w * 2.2;
        const freshD = 0.28 + 0.38 * Math.sin((dx - dy) * 3.0 + this.time * 4.0);
        thick[idx] += (freshD - thick[idx]) * Math.min(0.16, w * 0.10);
        shimmer[idx] = Math.min(1, shimmer[idx] + w * 0.06);
      }
    }
  }

  _injectVortex(lx, ly, radiusLocal, strength) {
    const gx = (lx * 0.5 + 0.5) * (this.nx - 1);
    const gy = (ly * 0.5 + 0.5) * (this.ny - 1);
    const rx = radiusLocal * 0.36 * this.nx;
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
    const gx = ((ndcX / 3.30) + 0.5) * (this.nx - 1);
    const gy = ((ndcY / 1.90) + 0.5) * (this.ny - 1);
    const rx = (radiusNdc / 3.30) * this.nx;
    const ry = (radiusNdc / 1.90) * this.ny;
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
    const advScale = h * 7.8;

    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        curl[idx] = 0.5 * ((vy[idx + 1] - vy[idx - 1]) - (vx[idx + nx] - vx[idx - nx]));
      }
    }
    const vortAmp = 1.8 * h;
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

    const damp = Math.exp(-1.12 * h);
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

    // 1. Determine active liquid bridge pair (either splitting child <-> parent OR dragged <-> nearest neighbor)
    let pairA = -1, pairB = -1, targetK = 0;
    if (this.drag && this.drag.mode === 'splitting') {
      pairA = this.clusters.findIndex((c) => c.uid === this.drag.parentUid);
      pairB = this.clusters.findIndex((c) => c.uid === this.drag.uid);
      if (pairA >= 0 && pairB >= 0) {
        const a = this.clusters[pairA];
        const b = this.clusters[pairB];
        const dist = Math.hypot(b.xCss - a.xCss, b.yCss - a.yCss);
        const snapDist = (this._radiusForCount(a.tags.length) + this._radiusForCount(1)) * 1.46;
        // Long lush blown-glass catenoid neck that stretches visibly before thinning at snapDist!
        const u = Math.max(0, Math.min(1, dist / snapDist));
        targetK = 0.34 * Math.pow(Math.max(0, 1.0 - Math.pow(u, 3.0)), 0.62);
      }
    } else if (this.drag && this.drag.mode === 'drag') {
      pairA = this.clusters.findIndex((c) => c.uid === this.drag.uid);
      if (pairA >= 0) {
        const a = this.clusters[pairA];
        let bestIdx = -1, bestGap = Infinity;
        for (let j = 0; j < this.clusters.length; j++) {
          if (j === pairA) continue;
          const b = this.clusters[j];
          const gap = Math.hypot(b.xCss - a.xCss, b.yCss - a.yCss) - (a.rCss + b.rCss);
          if (gap < bestGap) { bestGap = gap; bestIdx = j; }
        }
        if (bestIdx >= 0 && bestGap < 48 * this.scale) {
          pairB = bestIdx;
          const q = Math.max(0, Math.min(1, 1.0 - bestGap / (48 * this.scale)));
          targetK = 0.30 * (q * q * (3.0 - 2.0 * q));
        }
      }
    }

    if (pairA >= 0 && pairB >= 0 && targetK > 0.002) {
      this.bridge.idxA = pairA;
      this.bridge.idxB = pairB;
      this.bridge.targetK = targetK;
      this.bridge.k += (targetK - this.bridge.k) * Math.min(1, h * 24.0);
    } else {
      this.bridge.targetK = 0;
      this.bridge.k *= Math.exp(-22.0 * h);
      if (this.bridge.k < 0.002) {
        this.bridge.k = 0;
        this.bridge.idxA = -1;
        this.bridge.idxB = -1;
      }
    }

    // 2. Soft non-overlapping repulsion between free floating bubbles + magnetic reach across active bridge
    const n = this.clusters.length;
    for (let i = 0; i < n; i++) {
      const c = this.clusters[i];
      const isDragged = this.drag && (this.drag.uid === c.uid) && (this.drag.mode === 'drag' || this.drag.mode === 'splitting');
      const isHov = (this.hoveredUid === c.uid) || isDragged;

      c.hoverMix += ((isHov ? 1 : 0) - c.hoverMix) * Math.min(1, h * 12);
      c.dragMix += ((isDragged ? 1 : 0) - c.dragMix) * Math.min(1, h * 14);

      const targetR = this._radiusForCount(c.tags.length) + (isHov ? 2.2 * this.scale : 0);
      c.rVel += ((targetR - c.rCss) * 225 - c.rVel * 16.5) * h;
      c.rCss = Math.max(16, c.rCss + c.rVel * h);

      // Compute radial stretch toward active bridge partner
      let targetStretch = 0;
      if (this.bridge.k > 0.01 && (i === this.bridge.idxA || i === this.bridge.idxB)) {
        const other = this.clusters[i === this.bridge.idxA ? this.bridge.idxB : this.bridge.idxA];
        if (other) {
          const dxN = this._toNdcX(other.xCss) - this._toNdcX(c.xCss);
          const dyN = this._toNdcY(other.yCss) - this._toNdcY(c.yCss);
          c.stretchAngNdc = Math.atan2(dyN, dxN);
          targetStretch = Math.min(1.0, this.bridge.k / 0.18);
        }
      }
      c.stretch += (targetStretch - c.stretch) * Math.min(1, h * 16);

      if (!isDragged) {
        // Gentle buoyant floating bob around home anchor
        const bobX = Math.sin(this.time * 1.35 + c.bobPhase) * 3.0 * this.scale;
        const bobY = Math.cos(this.time * 1.85 + c.bobPhase * 0.9) * 3.4 * this.scale;
        let fx = (c.homeX + bobX - c.xCss) * 28.0;
        let fy = (c.homeY + bobY - c.yCss) * 28.0;

        // Magnetic pull toward active bridge partner when merging or tearing!
        if (this.bridge.k > 0.01 && (i === this.bridge.idxA || i === this.bridge.idxB)) {
          const other = this.clusters[i === this.bridge.idxA ? this.bridge.idxB : this.bridge.idxA];
          if (other) {
            const dx = other.xCss - c.xCss;
            const dy = other.yCss - c.yCss;
            const dist = Math.hypot(dx, dy) + 1e-4;
            const pull = (this.bridge.k / 0.25) * 420.0 * this.scale;
            fx += (dx / dist) * pull;
            fy += (dy / dist) * pull;
          }
        }

        // Soft separation repulsion against non-bridged neighbors so idle bubbles never accidentally collide
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const isBridgedPair = (this.bridge.k > 0.005) && ((i === this.bridge.idxA && j === this.bridge.idxB) || (i === this.bridge.idxB && j === this.bridge.idxA));
          if (isBridgedPair) continue;
          const o = this.clusters[j];
          const dx = c.xCss - o.xCss;
          const dy = c.yCss - o.yCss;
          const dist = Math.hypot(dx, dy) + 1e-4;
          const minSep = c.rCss + o.rCss + 24 * this.scale;
          if (dist < minSep) {
            const push = (minSep - dist) * 46.0;
            fx += (dx / dist) * push;
            fy += (dy / dist) * push;
          }
        }

        c.vx += (fx - c.vx * 8.5) * h;
        c.vy += (fy - c.vy * 8.5) * h;
        c.xCss += c.vx * h;
        c.yCss += c.vy * h;

        // Keep gently inside stage frame
        const pad = c.rCss + 16 * this.scale;
        c.xCss = Math.max(pad, Math.min(this.width - pad, c.xCss));
        c.yCss = Math.max(pad, Math.min(this.height - pad, c.yCss));
      }

      c.wobPhase += c.wobFreq * h;
      c.wobAmp *= Math.exp(-4.0 * h);
    }

    const activeNow = (this.drag || this.bridge.k > 0.01) ? 0.9 : 0.0;
    this.activity += (activeNow - this.activity) * Math.min(1, h * 6);
    if (activeNow < 0.1) {
      this._injectVortex(Math.sin(this.time * 0.9) * 0.28, Math.cos(this.time * 1.1) * 0.18, 0.34, 0.42 * h * 13);
    }

    // 3. Fluid & capillary wave grid
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

    // 4. Floating tear-split satellite droplets
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

  _drawUnderTags() {
    const ctx = this.underCtx;
    const dpr = this.dpr;
    const W = this.underCanvas.width;
    const H = this.underCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const sc = this.scale * dpr;

    for (const c of this.clusters) {
      const cx = c.xCss * dpr;
      const cy = c.yCss * dpr;
      const n = c.tags.length;
      const isMerged = n >= 2;
      const isHovCluster = (this.hoveredUid === c.uid);

      if (!isMerged) {
        // Single tag: crisp dot + tag label centered cleanly inside the bubble
        const tag = c.tags[0];
        ctx.save();
        ctx.font = `600 ${12.2 * sc}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
        const tw = ctx.measureText(tag.label).width;
        const dotR = 3.0 * sc;
        const gap = 6.0 * sc;
        const totalW = dotR * 2 + gap + tw;
        const startX = cx - totalW * 0.5;

        ctx.beginPath();
        ctx.arc(startX + dotR, cy, dotR, 0, Math.PI * 2);
        ctx.fillStyle = tag.dot;
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(20, 22, 34, ${0.84 + c.hoverMix * 0.12})`;
        ctx.fillText(tag.label, startX + dotR * 2 + gap, cy + 0.5 * sc);
        ctx.restore();
      } else {
        // Merged group bubble: neatly stacked tactile tag rows with subtle hairline dividers!
        const rowH = 19.5 * sc;
        for (let i = 0; i < n; i++) {
          const tag = c.tags[i];
          const ry = cy + (i - (n - 1) * 0.5) * rowH;
          const isRowHov = isHovCluster && (this.hoveredRow === i) && (!this.drag || this.drag.mode === 'split_pending');

          ctx.save();
          ctx.font = `${isRowHov ? 600 : 500} ${11.6 * sc}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
          const tw = ctx.measureText(tag.label).width;
          const dotR = (isRowHov ? 3.2 : 2.7) * sc;
          const gap = 5.5 * sc;
          const totalW = dotR * 2 + gap + tw;
          const startX = cx - totalW * 0.5;

          if (isRowHov) {
            // Whisper-soft pill highlight on the hovered tag row to hint it can be grabbed & torn out
            const pw = totalW + 14 * sc;
            const ph = 16.5 * sc;
            ctx.beginPath();
            ctx.roundRect(cx - pw * 0.5, ry - ph * 0.5, pw, ph, ph * 0.5);
            ctx.fillStyle = 'rgba(22, 24, 38, 0.055)';
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(startX + dotR, ry, dotR, 0, Math.PI * 2);
          ctx.fillStyle = tag.dot;
          ctx.fill();

          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const textAlpha = isRowHov ? 0.94 : (isHovCluster ? 0.62 : 0.84);
          ctx.fillStyle = `rgba(20, 22, 34, ${textAlpha})`;
          ctx.fillText(tag.label, startX + dotR * 2 + gap, ry + 0.4 * sc);

          // Tiny subtle '+' connector between merged tags when not hovering
          if (i < n - 1) {
            const divY = ry + rowH * 0.5;
            ctx.strokeStyle = 'rgba(22, 24, 38, 0.07)';
            ctx.lineWidth = 1.0 * sc;
            ctx.beginPath();
            ctx.moveTo(cx - 22 * sc, divY);
            ctx.lineTo(cx + 22 * sc, divY);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
  }

  render() {
    this._drawUnderTags();

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

    this.bubBuf.fill(0);
    this.bubMetaBuf.fill(0);
    this.bubVisBuf.fill(0);
    const nB = Math.min(this.maxBubs, this.clusters.length);
    for (let i = 0; i < nB; i++) {
      const c = this.clusters[i];
      const o = i * 4;
      this.bubBuf[o]     = this._toNdcX(c.xCss);
      this.bubBuf[o + 1] = this._toNdcY(c.yCss);
      this.bubBuf[o + 2] = this._pxToNdc(c.rCss);
      this.bubBuf[o + 3] = c.wobAmp;

      this.bubMetaBuf[o]     = c.wobPhase;
      this.bubMetaBuf[o + 1] = Math.min(1.0, (c.tags.length - 1) / 2.0);
      this.bubMetaBuf[o + 2] = c.stretch;
      this.bubMetaBuf[o + 3] = c.stretchAngNdc;

      this.bubVisBuf[o]     = c.hoverMix;
      this.bubVisBuf[o + 1] = c.dragMix;
      this.bubVisBuf[o + 2] = 0;
      this.bubVisBuf[o + 3] = 0;
    }
    gl.uniform1i(u.uBubCount, nB);
    gl.uniform4fv(u.uBubs, this.bubBuf);
    gl.uniform4fv(u.uBubMeta, this.bubMetaBuf);
    gl.uniform4fv(u.uBubVis, this.bubVisBuf);

    gl.uniform4f(u.uBridge, this.bridge.idxA, this.bridge.idxB, this.bridge.k, 0);
    gl.uniform1f(u.uActivity, this.activity);

    this.dPosBuf.fill(0);
    this.dOptBuf.fill(0);
    const nD = Math.min(this.maxDaughters, this.floatBubbles.length);
    for (let i = 0; i < nD; i++) {
      const b = this.floatBubbles[i];
      const birthScale = Math.min(1.0, b.age / 0.045);
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
