// ============================================================================
// SOAP FILM · MITOSIS FAB (RADIAL BUDDING + VOLUME CONSERVATION + POP TRIGGER)
// ============================================================================
// A single plump '+' soap bubble at rest. Clicking it triggers cellular mitosis:
// 4 action buds (Camera, Note, Mic, Link) extrude radially out of the membrane,
// stretching glossy catenoid liquid necks and pinching off with jelly recoil and
// floating 3D micro-droplets while the hub shrinks to conserve 3D sphere volume.
// Clicking '×' pulls all buds back in to re-fuse into one big bubble; clicking
// an action bud inflates and pops it in an expanding soap-ring mist while the
// remaining buds re-absorb into the hub.

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

// Central hub bubble:
// uHub = (cx, cy, r, wobAmp)
// uHubMeta = (wobPhase, massFrac 0..1, openBlend 0..1, squash)
uniform vec4 uHub;
uniform vec4 uHubMeta;

// 4 radial action buds:
// uBuds[i] = (cx, cy, r, wobAmp)
// uBudMeta[i] = (wobPhase, neckK, stretchAmt, angleRad)
#define NUM_BUDS 4
uniform vec4 uBuds[NUM_BUDS];
uniform vec4 uBudMeta[NUM_BUDS];
uniform vec4 uBudCharge;      // per-bud pre-pop inflation tension 0..1

// Expanding iridescent soap rupture ring when a bud pops:
// uPopRing = (cx, cy, radiusNdc, alpha)
uniform vec4 uPopRing;
uniform float uActivity;      // 0..1 global mitosis flow intensity

// Delicate 3D WebGL2 satellite droplets (pinch-off + pop mist)
#define MAX_DAUGHTERS 16
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

// High-chroma stylized-physical thin-film interference spectrum (matches Soap Film family)
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
  float arc1 = smoothstep(0.85, 0.94, ndh1) * 0.78 + smoothstep(0.955, 0.990, ndh1) * 0.98;

  vec3 L2 = normalize(vec3(0.68, -0.56, 0.44));
  vec3 H2 = normalize(L2 + V);
  float ndh2 = max(0.0, dot(N, H2));
  float arc2 = smoothstep(0.88, 0.96, ndh2) * 0.52;

  float skyArc = smoothstep(0.22, 0.90, -pNorm.x * 0.55 + pNorm.y * 0.85) * smoothstep(0.16, 0.80, 1.0 - NdotV) * 0.26;

  // Optical 4-ray + diagonal diamond starburst glint on upper-left shoulder
  vec2 starCenter = vec2(-0.42, 0.50);
  vec2 dStar = (pNorm - starCenter) * 3.4;
  float rStar = length(dStar);
  float rayH = exp(-abs(dStar.y) * 26.0) * exp(-abs(dStar.x) * 4.0);
  float rayV = exp(-abs(dStar.x) * 26.0) * exp(-abs(dStar.y) * 4.0);
  vec2 dDiag = vec2(dStar.x + dStar.y, dStar.x - dStar.y) * 0.7071;
  float rayD = (exp(-abs(dDiag.y) * 34.0) * exp(-abs(dDiag.x) * 7.0)
              + exp(-abs(dDiag.x) * 34.0) * exp(-abs(dDiag.y) * 7.0)) * 0.50;
  float coreDot = exp(-rStar * rStar * 22.0);
  float twinkle = 0.82 + 0.18 * sin(time * (4.6 + starBoost * 4.8) + pNorm.x * 2.0);
  float starburst = (coreDot * 0.98 + (rayH + rayV + rayD) * smoothstep(0.82, 0.0, rStar) * 0.90)
                  * twinkle * smoothstep(0.35, 0.80, ndh1 + 0.20) * starBoost;

  return vec3(clamp(arc1 + arc2 + skyArc + starburst, 0.0, 1.55), skyArc, starburst);
}

vec4 over(vec4 src, vec4 dst) {
  return vec4(src.rgb + dst.rgb * (1.0 - src.a), src.a + dst.a * (1.0 - src.a));
}

// Photorealistic 3D WebGL2 pinch-off & pop-mist satellite micro-bubble
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
// RADIAL MITOSIS COMPOUND SDF (CENTRAL HUB + 4 RADIAL CATENOID NECKS & BUDS)
// ============================================================================
float sdHubBubble(vec2 p) {
  vec2 bp = p - uHub.xy;
  float r = max(0.02, uHub.z);
  float ang = atan(bp.y, bp.x);
  float rNorm = length(bp) / r;
  float wobFade = smoothstep(0.08, 0.48, rNorm);

  // Subtle vertical squash/inhale right on press
  float sq = 1.0 + uHubMeta.w * 0.10;
  vec2 sp = vec2(bp.x / sq, bp.y * sq);
  float baseD = length(sp) - r;

  float ph = uHubMeta.x;
  float wob = uHub.w * (0.72 * cos(2.0 * ang + ph) + 0.28 * sin(3.0 * ang - ph * 1.35)) * r * wobFade;
  float breath = 0.0024 * sin(2.0 * ang + uTime * 2.1) * wobFade;
  return baseD - wob - breath;
}

float sdRadialBud(vec2 p, vec4 bud, vec4 meta, float charge) {
  float r = max(0.005, bud.z);
  vec2 bp = p - bud.xy;
  float angAxis = meta.w;
  vec2 dir = vec2(cos(angAxis), sin(angAxis));
  vec2 perp = vec2(-dir.y, dir.x);

  // Subtle radial teardrop elongation along the stretching catenoid neck!
  float stretch = 1.0 + clamp(meta.z, 0.0, 1.0) * 0.17;
  vec2 local = vec2(dot(bp, dir) / stretch, dot(bp, perp) * sqrt(stretch));
  float baseD = (length(local) - r) * sqrt(stretch);

  float ang = atan(bp.y, bp.x);
  float rNorm = length(bp) / r;
  float wobFade = smoothstep(0.08, 0.48, rNorm);
  float ph = meta.x;
  float wobAmp = bud.w + charge * 0.045;
  float wob = wobAmp * (0.72 * cos(2.0 * ang + ph) + 0.28 * sin(3.0 * ang - ph * 1.35)) * r * wobFade;
  float breath = 0.0018 * sin(2.0 * ang + uTime * 2.4 + ph * 0.4) * wobFade;
  return baseD - wob - breath;
}

float sdMitosisSoap(
  vec2 p,
  out vec2 outSmoothCenter,
  out float outSmoothR,
  out float outMassMix,
  out float outBridgeF,
  out float outChargeMix
) {
  float dHub = sdHubBubble(p);
  float dMin = dHub;

  float dB[NUM_BUDS];
  bool activeB[NUM_BUDS];
  for (int i = 0; i < NUM_BUDS; i++) {
    activeB[i] = (uBuds[i].z > 0.006);
    if (activeB[i]) {
      float ch = (i == 0) ? uBudCharge.x : (i == 1) ? uBudCharge.y : (i == 2) ? uBudCharge.z : uBudCharge.w;
      dB[i] = sdRadialBud(p, uBuds[i], uBudMeta[i], ch);
      dMin = min(dMin, dB[i]);
    } else {
      dB[i] = 10.0;
    }
  }

  // C-infinity softmax blending across hub + all active buds -> ZERO Voronoi seams!
  float wH = exp(-max(0.0, dHub - dMin) * 16.0);
  vec2 cSum = uHub.xy * wH;
  float rSum = uHub.z * wH;
  float mSum = uHubMeta.y * wH;
  float chSum = 0.0;
  float wSum = wH;

  for (int i = 0; i < NUM_BUDS; i++) {
    if (activeB[i]) {
      float wi = exp(-max(0.0, dB[i] - dMin) * 16.0);
      float ch = (i == 0) ? uBudCharge.x : (i == 1) ? uBudCharge.y : (i == 2) ? uBudCharge.z : uBudCharge.w;
      cSum += uBuds[i].xy * wi;
      rSum += uBuds[i].z * wi;
      // Detached buds glow crisply too; charged pre-pop bud glows brightest!
      mSum += (0.58 + 0.42 * ch) * wi;
      chSum += ch * wi;
      wSum += wi;
    }
  }
  float invW = 1.0 / max(1e-5, wSum);
  outSmoothCenter = cSum * invW;
  outSmoothR = rSum * invW;
  outMassMix = mSum * invW;
  outChargeMix = chSum * invW;

  float dTotal = dMin;
  outBridgeF = 0.0;

  // Pure analytical radial catenoid liquid necks connecting ONLY hub <-> each bud!
  // smin(dHub, dBud, kk) forms a smooth hourglass catenoid when gap < kk*0.5 and pinches off cleanly with zero detached blobs.
  for (int i = 0; i < NUM_BUDS; i++) {
    float kk = uBudMeta[i].y;
    if (activeB[i] && kk > 0.002) {
      float dPair = smin(dHub, dB[i], kk);
      float neckBand = exp(-abs(dHub - dB[i]) / max(0.026, kk * 0.72)) * smoothstep(0.002, 0.055, kk);
      // Only illuminate bridge zone while hub & bud are close enough to actually form a meniscus
      float sep = max(0.0, dHub + dB[i]);
      neckBand *= smoothstep(kk * 0.72, kk * 0.22, sep);

      // Smooth inter-pair fillet eliminates sharp V-creases where neighboring necks meet the hub
      // while keeping outer buds cleanly separated!
      dTotal = smin(dTotal, dPair, kk * 0.36);
      outBridgeF = max(outBridgeF, neckBand);
    }
  }

  return dTotal;
}

void main() {
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2((vUv.x * 2.0 - 1.0) * aspect, (vUv.y * 2.0 - 1.0));
  float px = 2.0 / uSize.y;

  vec4 outCol = vec4(0.0);

  // Fast bounding-box early-out covering hub + radial fan arc + shadows + pop ring
  bool inStageBox = (abs(p.x) < 1.25) && (p.y < 0.88) && (p.y > -0.78);

  if (inStageBox) {
    vec2 smoothC;
    float smoothR, massMix, bridgeF, chargeMix;
    float sdBubble = sdMitosisSoap(p, smoothC, smoothR, massMix, bridgeF, chargeMix);

    // --- 1. SEAMLESS AIRY FLOATING SHADOWS BENEATH HUB & BUDS ---
    {
      float shAcc = 0.0;
      // Hub shadow
      {
        float m = uHubMeta.y;
        vec2 shPos = uHub.xy + vec2(0.015, -(0.046 + 0.018 * m));
        float rSh = uHub.z * (1.28 + 0.14 * m);
        float dSh = length(p - shPos);
        if (dSh < rSh * 1.45) {
          float s = smoothstep(rSh * 1.35, uHub.z * 0.18, dSh) * (0.036 + 0.022 * m);
          shAcc = max(shAcc, s);
        }
      }
      // Bud shadows
      for (int i = 0; i < NUM_BUDS; i++) {
        float rb = uBuds[i].z;
        if (rb > 0.008) {
          float fade = smoothstep(0.008, 0.06, rb);
          vec2 shPos = uBuds[i].xy + vec2(0.013, -0.042);
          float rSh = rb * 1.28;
          float dSh = length(p - shPos);
          if (dSh < rSh * 1.45) {
            float s = smoothstep(rSh * 1.35, rb * 0.18, dSh) * 0.038 * fade;
            shAcc = max(shAcc, s);
          }
        }
      }
      if (shAcc > 0.001) {
        outCol = over(vec4(vec3(0.24, 0.26, 0.44) * shAcc, shAcc), outCol);
      }
    }

    // --- 2. 3D VOLUMETRIC IRIDESCENT HUB + BUDS + RADIAL CATENOID NECKS ---
    float orbMask = smoothstep(px * 1.75, -px * 1.75, sdBubble);
    if (orbMask > 0.001) {
      float eps = 0.004;
      vec2 dC;
      float dR, dM, dB, dCh;
      vec2 rawGrad = vec2(
        sdMitosisSoap(p + vec2(eps, 0.0), dC, dR, dM, dB, dCh) - sdMitosisSoap(p - vec2(eps, 0.0), dC, dR, dM, dB, dCh),
        sdMitosisSoap(p + vec2(0.0, eps), dC, dR, dM, dB, dCh) - sdMitosisSoap(p - vec2(0.0, eps), dC, dR, dM, dB, dCh)
      ) / (2.0 * eps);
      float gradLen = length(rawGrad);
      vec2 gSmooth = rawGrad / sqrt(dot(rawGrad, rawGrad) + 0.025);

      float dIn = max(0.0, -sdBubble);
      float scaleSafe = max(0.018, mix(smoothR, max(0.034, smoothR * 0.62), bridgeF * 0.65));
      float rho = clamp(1.0 - dIn / scaleSafe, 0.0, 0.998);
      vec2 pNorm = (p - smoothC) / max(vec2(smoothR), vec2(0.04));

      // Sample live 2D Navier-Stokes fluid grid covering the radial mitosis stage!
      vec2 simUv = clamp(((p - vec2(0.0, 0.04)) / vec2(2.35, 1.55)) + 0.5, 0.004, 0.996);
      vec2 texel = 1.0 / vec2(textureSize(uSim, 0));
      vec4 simC = texture(uSim, simUv);
      float zL = texture(uSim, simUv - vec2(texel.x, 0.0)).g;
      float zR = texture(uSim, simUv + vec2(texel.x, 0.0)).g;
      float zD = texture(uSim, simUv - vec2(0.0, texel.y)).g;
      float zU = texture(uSim, simUv + vec2(0.0, texel.y)).g;
      vec2 gradZ = vec2(zR - zL, zU - zD) * 5.8;

      // World-space continuous capillary swirl (ZERO phase jump across radial bridges!)
      vec2 swirlTilt = (0.030 + 0.042 * massMix + 0.052 * bridgeF + 0.040 * chargeMix) * vec2(
        sin(p.y * 13.5 + p.x * 4.2 + uTime * 2.5),
        cos(p.x * 12.0 - p.y * 4.8 - uTime * 2.2)
      );

      float saddleFlat = clamp(gradLen, 0.0, 1.0);
      float domeR = mix(rho, rho * saddleFlat, bridgeF * 0.72);
      float rimSteep = pow(clamp(domeR, 1e-4, 0.995), 1.06) * (0.88 + 0.14 * massMix + 0.06 * bridgeF);

      vec2 nXY = gSmooth * rimSteep + swirlTilt - gradZ;
      float nXY2 = dot(nXY, nXY);
      vec3 N = normalize(vec3(nXY, sqrt(max(0.06, 1.0 - min(0.94, nXY2)))));
      vec3 V = vec3(0.0, 0.0, 1.0);
      float NdotV = clamp(dot(N, V), 0.06, 1.0);
      float slopeMag = length(gradZ);

      float fres = pow(max(1e-4, 1.0 - NdotV), 2.22);
      float razorRim = pow(max(1e-4, 1.0 - NdotV), 4.7);

      // Resolution-adaptive crisp optical rim contour along hub, buds, AND radial necks
      float rimOff = max(0.050, min(0.20, px * 1.25 / scaleSafe));
      float normDepth = clamp(dIn / scaleSafe, 0.0, 1.0);
      float ioArg = (normDepth - rimOff) / max(0.036, rimOff * 0.68);
      float innerOutline = exp(-(ioArg * ioArg));
      float hairOff = min(0.048, px * 0.52 / scaleSafe);
      float owArg = (normDepth - hairOff) / max(0.022, px * 0.55 / scaleSafe);
      float outerWhiteHair = exp(-(owArg * owArg));

      // World-space continuous thin-film thickness -> unbroken rainbow flow through radial necks!
      float flowWave = 0.5 + 0.5 * sin(p.x * 4.4 - p.y * 6.0 + simC.r * 3.6 + uTime * (0.90 + 1.8 * uActivity));
      float dNmBase = mix(145.0, 740.0, simC.r * 0.66 + flowWave * 0.34);
      float dNm = dNmBase + p.x * 95.0 - p.y * 65.0 + fres * 235.0 + bridgeF * 155.0 + massMix * 48.0 - chargeMix * 120.0;

      float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
      float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
      vec3 irid = bubbleIridescence(dNm, cosTheta);

      // Starburst glint brightens on plump hub and peaks right before a bud pops!
      float starBoost = (0.28 + 0.78 * massMix + 0.45 * chargeMix) * (1.0 - smoothstep(0.10, 0.55, bridgeF));
      vec3 specInfo = bubbleSpeculars(N, NdotV, pNorm, uTime, starBoost);
      // Softly attenuate broad specular glare across wide flat bridge saddles so icons stay crisp
      float specArc = specInfo.x * (1.0 - bridgeF * 0.44);

      vec2 spGrid = (p + vec2(simC.r * 0.32, -simC.g * 0.25)) * 22.0;
      vec2 spCell = floor(spGrid);
      vec2 spF = fract(spGrid) - 0.5;
      float spRnd = hash21(spCell);
      float spDot = smoothstep(0.16, 0.02, length(spF)) * step(0.94 - (massMix * 0.02 + bridgeF * 0.025 + chargeMix * 0.04), spRnd)
                  * (0.45 + 0.55 * sin(uTime * 6.2 + spRnd * 40.0))
                  * (0.30 + 0.65 * fres + simC.b + bridgeF * 0.45 + chargeMix * 0.6);

      float chromaRich = 0.72 + 0.28 * max(max(massMix, bridgeF), chargeMix);
      vec3 contourCol = mix(vec3(0.38, 0.42, 0.68), irid * 0.65 + vec3(0.18, 0.16, 0.36), 0.52);
      vec3 domeColor = mix(vec3(0.94, 0.97, 1.0), irid * 0.94 + vec3(0.15, 0.18, 0.26), 0.88 * chromaRich);

      vec3 col = mix(vec3(0.97, 0.98, 1.0), domeColor, clamp(0.15 + fres * 0.80 + bridgeF * 0.34 + slopeMag * 0.42 + massMix * 0.14 + chargeMix * 0.18, 0.0, 1.0));
      col = mix(col, contourCol, clamp(innerOutline * (0.48 + 0.14 * massMix) + razorRim * 0.45 + bridgeF * 0.14, 0.0, 0.82));
      float crescentBand = smoothstep(0.08, 0.76, max(fres, bridgeF * 0.66)) * (1.0 - outerWhiteHair * 0.62);
      col = mix(col, clamp(irid * 1.14 + vec3(0.09, 0.07, 0.13), 0.0, 1.0), crescentBand * (0.58 + 0.18 * max(max(massMix, bridgeF), chargeMix)));
      col = mix(col, vec3(1.0, 0.998, 1.0), clamp(specArc * 0.95 + outerWhiteHair * 0.85 + spDot * 0.85, 0.0, 0.99));

      float rimAlpha = innerOutline * (0.46 + 0.16 * massMix) + outerWhiteHair * 0.72 + razorRim * 0.54;
      float alpha = clamp(
        0.044 + fres * (0.64 + 0.18 * max(massMix, chargeMix)) + rimAlpha + specArc * 0.84 + bridgeF * 0.28 + slopeMag * 0.30 + spDot * 0.58,
        0.0,
        0.96
      );

      vec4 bubLayer = vec4(col * (alpha * orbMask), alpha * orbMask);
      outCol = over(bubLayer, outCol);
    }

    // --- 3. EXPANDING IRIDESCENT SOAP RUPTURE RING WHEN A BUD POPS ---
    if (uPopRing.w > 0.005) {
      vec2 dp = p - uPopRing.xy;
      float rRing = uPopRing.z;
      float dist = length(dp);
      float ang = atan(dp.y, dp.x);
      // Organic scalloped Taylor-Culick rim breakup
      float rimWave = 0.012 * (sin(ang * 7.0 + uTime * 8.0) * 0.6 + cos(ang * 11.0 - uTime * 6.0) * 0.4);
      float ringW = max(0.009, 0.022 * uPopRing.w);
      float dR = abs(dist - (rRing + rimWave));
      float ringMask = exp(-(dR * dR) / max(1e-5, ringW * ringW));
      if (ringMask > 0.005) {
        float dNmR = 260.0 + 180.0 * sin(ang * 3.0 + uTime * 5.0) + (1.0 - uPopRing.w) * 160.0;
        vec3 iridR = bubbleIridescence(dNmR, 0.72);
        vec3 rCol = mix(iridR * 1.15 + vec3(0.12, 0.10, 0.18), vec3(1.0), 0.46);
        float ra = clamp(ringMask * uPopRing.w * 0.82, 0.0, 0.88);
        outCol = over(vec4(rCol * ra, ra), outCol);
      }
    }
  }

  // --- 4. 3D WEBGL2 SATELLITE MICRO-DROPLETS (PINCH-OFF + POP MIST) ---
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

const DEFAULT_ACTIONS = [
  { id: 'camera', label: 'Camera', confirm: 'Camera' },
  { id: 'note',   label: 'Note',   confirm: 'New note' },
  { id: 'mic',    label: 'Mic',    confirm: 'Listening' },
  { id: 'link',   label: 'Link',   confirm: 'Link copied' },
];

class SoapMitosisFab {
  constructor(container, opts = {}) {
    this.width = opts.width || 640;
    this.height = opts.height || 360;
    this.aspect = this.width / this.height;
    this.dpr = opts.dpr || 2;
    this.audio = opts.audio || null;
    this.actions = opts.actions || DEFAULT_ACTIONS;
    this.budCount = 4;
    this.onAction = opts.onAction || (() => {});
    this.onToggle = opts.onToggle || (() => {});

    // Responsive sizing scaled cleanly to stage dimensions
    const scale = Math.min(1.0, (this.width - 28) / 480, (this.height - 24) / 336);
    this.scale = scale;
    this.hubBaseX = this.width * 0.5;
    this.hubBaseY = this.height * 0.64;

    // Exact 3D spherical volume conservation: 45.5^3 ≈ 28.5^3 + 4 * 26.2^3
    this.rClosedCss = 45.5 * scale;
    this.rHubOpenCss = 28.5 * scale;
    this.rBudOpenCss = 26.2 * scale;
    this.orbitRCss = 114 * scale;

    // Symmetrical upper fan arc (CSS screen angles: -90deg is straight up)
    const degs = [-155, -111.5, -68.5, -25];
    this.budAnglesCss = degs.map((d) => (d * Math.PI) / 180);

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

    // 2D Navier-Stokes fluid grid (68x48 matching radial fan stage)
    this.nx = 68;
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

    this.maxDaughters = 16;
    this.budPosBuf = new Float32Array(this.budCount * 4);
    this.budMetaBuf = new Float32Array(this.budCount * 4);
    this.dPosBuf = new Float32Array(this.maxDaughters * 4);
    this.dOptBuf = new Float32Array(this.maxDaughters * 4);

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

    const names = [
      'uSim', 'uRes', 'uSize', 'uTime',
      'uHub', 'uHubMeta', 'uBudCharge', 'uPopRing', 'uActivity', 'uDaughterCount',
    ];
    this.u = {};
    for (const n of names) this.u[n] = gl.getUniformLocation(this.prog, n);
    this.u.uBuds = gl.getUniformLocation(this.prog, 'uBuds') || gl.getUniformLocation(this.prog, 'uBuds[0]');
    this.u.uBudMeta = gl.getUniformLocation(this.prog, 'uBudMeta') || gl.getUniformLocation(this.prog, 'uBudMeta[0]');
    this.u.uDPos = gl.getUniformLocation(this.prog, 'uDPos') || gl.getUniformLocation(this.prog, 'uDPos[0]');
    this.u.uDOpt = gl.getUniformLocation(this.prog, 'uDOpt') || gl.getUniformLocation(this.prog, 'uDOpt[0]');
  }

  reset() {
    this.time = 1.0;
    this.isOpen = false;
    this.openBlend = 0; // 0 = closed (+), 1 = open (×)
    this.hovered = null; // null | 'hub' | 0..3
    this.activity = 0;

    this.hub = {
      xCss: this.hubBaseX,
      yCss: this.hubBaseY,
      yVel: 0,
      rCss: this.rClosedCss,
      rVel: 0,
      wobAmp: 0,
      wobPhase: 0.4,
      wobFreq: 13.0,
      squash: 0,
      squashVel: 0,
    };

    // Per-bud radial mitosis state
    this.buds = [];
    for (let i = 0; i < this.budCount; i++) {
      this.buds.push({
        idx: i,
        angCss: this.budAnglesCss[i],
        // u = 0 (absorbed inside hub) -> 1 (detached in orbit)
        u: 0,
        targetU: 0,
        delay: 0,
        distCss: 0,
        distVel: 0,
        rCss: 0,
        rVel: 0,
        xCss: this.hubBaseX,
        yCss: this.hubBaseY,
        neckK: 0,
        wasConnected: false,
        stretch: 0,
        wobAmp: 0,
        wobPhase: i * 1.45,
        wobFreq: 14.5 + i * 0.65,
        // Pop-to-trigger state
        popping: false,
        popT: 0,
        popped: false,
        charge: 0,
      });
    }

    // Active expanding soap rupture ring
    this.popRing = { active: false, xCss: 0, yCss: 0, rCss: 0, maxRCss: 0, t: 0, dur: 0.36 };

    // Minimalist floating confirmation badge after popping an action bud
    this.toast = { active: false, text: '', xCss: 0, yCss: 0, t: 0, dur: 1.15 };

    // Pending auto-close timer after popping an action
    this.autoCloseTimer = -1;
    this.mergeSoundPending = false;

    this.floatBubbles = [];
    this._seedFilm();
  }

  hubStagePos() {
    return { x: this.hubBaseX, y: this.hubBaseY };
  }

  budStagePos(idx) {
    const i = Math.max(0, Math.min(this.budCount - 1, idx));
    const a = this.budAnglesCss[i];
    return {
      x: this.hubBaseX + Math.cos(a) * this.orbitRCss,
      y: this.hubBaseY + Math.sin(a) * this.orbitRCss,
    };
  }

  hitTest(sx, sy) {
    // Check detached intact buds first when open
    if (this.isOpen) {
      for (let i = 0; i < this.budCount; i++) {
        const b = this.buds[i];
        if (b.popped || b.popping || b.u < 0.55) continue;
        const d = Math.hypot(sx - b.xCss, sy - b.yCss);
        if (d <= Math.max(b.rCss + 8, this.rBudOpenCss + 10)) return i;
      }
    }
    const dh = Math.hypot(sx - this.hub.xCss, sy - this.hub.yCss);
    if (dh <= Math.max(this.hub.rCss + 10, this.rHubOpenCss + 12)) return 'hub';
    return null;
  }

  setHovered(target) {
    if (target === this.hovered) return;
    const prev = this.hovered;
    this.hovered = target;
    if (target !== null && target !== prev) {
      if (target === 'hub') {
        this.hub.wobAmp = Math.max(this.hub.wobAmp, 0.042);
      } else if (typeof target === 'number' && this.buds[target]) {
        this.buds[target].wobAmp = Math.max(this.buds[target].wobAmp, 0.055);
      }
    }
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.audio?.unlock();
    this.isOpen = true;
    this.autoCloseTimer = -1;
    this.mergeSoundPending = false;

    // Gentle press squish + outward pressure pulse on central hub
    this.hub.squashVel -= 4.2;
    this.hub.wobAmp = Math.max(this.hub.wobAmp, 0.095);
    this._impulseZ(this._toNdcX(this.hubBaseX), this._toNdcY(this.hubBaseY), 0.34, 0.34);
    this.audio?.playTap(580);

    // Cascade buds outward left-to-right like organic soap mitosis!
    for (let i = 0; i < this.budCount; i++) {
      const b = this.buds[i];
      b.popped = false;
      b.popping = false;
      b.popT = 0;
      b.charge = 0;
      b.targetU = 1.0;
      b.delay = i * 0.062;
      if (b.u < 0.02) {
        b.distCss = this.rClosedCss * 0.25;
        b.rCss = this.rBudOpenCss * 0.28;
      }
    }
    this.onToggle(true);
  }

  close() {
    this.audio?.unlock();
    if (!this.isOpen) return;
    this.isOpen = false;
    this.autoCloseTimer = -1;
    this.mergeSoundPending = true;

    this.hub.squashVel += 3.2;
    this.hub.wobAmp = Math.max(this.hub.wobAmp, 0.085);
    this.audio?.playTap(440);

    // Slight symmetric stagger as all intact buds rush back to coalesce into the hub
    const closeDelays = [0.00, 0.04, 0.04, 0.00];
    for (let i = 0; i < this.budCount; i++) {
      const b = this.buds[i];
      if (!b.popped && !b.popping) {
        b.targetU = 0.0;
        b.delay = closeDelays[i];
      }
    }
    this.onToggle(false);
  }

  triggerBud(idx) {
    if (!this.isOpen || idx < 0 || idx >= this.budCount) return;
    const b = this.buds[idx];
    if (b.popped || b.popping || b.u < 0.45) return;

    this.audio?.unlock();
    b.popping = true;
    b.popT = 0;
    b.wobAmp = Math.max(b.wobAmp, 0.11);
    this.audio?.playTap(760);
    this.onAction(idx, this.actions[idx]);
  }

  _spawnPinchDroplets(bud) {
    // 2 tiny iridescent satellite droplets drifting cleanly into white air off the snapped radial neck
    const midX = this._toNdcX((this.hub.xCss + bud.xCss) * 0.5);
    const midY = this._toNdcY((this.hub.yCss + bud.yCss) * 0.5);
    const angNdc = -bud.angCss; // CSS Y-down -> NDC Y-up
    const dx = Math.cos(angNdc);
    const dy = Math.sin(angNdc);
    const px = -dy;
    const py = dx;

    for (let s = 0; s < 2; s++) {
      if (this.floatBubbles.length >= this.maxDaughters) this.floatBubbles.shift();
      const side = s === 0 ? 1 : -1;
      const spread = 0.048 + Math.random() * 0.032;
      this.floatBubbles.push({
        x: midX + px * side * 0.028 + (Math.random() - 0.5) * 0.016,
        y: midY + py * side * 0.028 + 0.015,
        vx: px * side * (0.09 + Math.random() * 0.07) + dx * 0.04,
        vy: py * side * spread + 0.18 + Math.random() * 0.11,
        r: s === 0 ? (0.020 + Math.random() * 0.006) : (0.011 + Math.random() * 0.005),
        dNm: 220 + Math.random() * 280,
        wobAmp: 0.22,
        wobPhase: Math.random() * Math.PI * 2,
        wobFreq: 17.0 + Math.random() * 6.0,
        driftPhase: Math.random() * Math.PI * 2,
        driftAmp: 0.032,
        buoyancy: 0.12,
        drag: 2.6,
        age: 0,
        life: 1.0,
        decay: 1.35 + Math.random() * 0.45,
      });
    }
  }

  _spawnPopMist(bud) {
    const cx = this._toNdcX(bud.xCss);
    const cy = this._toNdcY(bud.yCss);
    const rNdc = this._pxToNdc(bud.rCss);
    const count = 8;
    for (let i = 0; i < count; i++) {
      if (this.floatBubbles.length >= this.maxDaughters) this.floatBubbles.shift();
      const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const spd = 0.24 + Math.random() * 0.24;
      this.floatBubbles.push({
        x: cx + Math.cos(a) * rNdc * 0.86,
        y: cy + Math.sin(a) * rNdc * 0.86,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd + 0.10,
        r: (i % 2 === 0 ? 0.019 : 0.011) + Math.random() * 0.006,
        dNm: 180 + Math.random() * 340,
        wobAmp: 0.26,
        wobPhase: Math.random() * Math.PI * 2,
        wobFreq: 18.0 + Math.random() * 7.0,
        driftPhase: Math.random() * Math.PI * 2,
        driftAmp: 0.038,
        buoyancy: 0.10,
        drag: 2.8,
        age: 0,
        life: 1.0,
        decay: 1.45 + Math.random() * 0.55,
      });
    }
  }

  _seedFilm() {
    const { nx, ny } = this;
    const ph = 0.72;
    for (let j = 0; j < ny; j++) {
      const v = j / (ny - 1);
      for (let i = 0; i < nx; i++) {
        const u = i / (nx - 1);
        const idx = j * nx + i;
        const wave = 0.22 * Math.sin(u * 6.5 + ph) * Math.sin(v * Math.PI)
                   + 0.16 * Math.cos(u * 4.4 - v * 3.8 + ph * 0.8);
        this.thick[idx] = Math.max(0.08, Math.min(0.92, 0.24 + (1.0 - v) * 0.42 + wave));
        this.z[idx] = 0;
        this.zPrev[idx] = 0;
        this.shimmer[idx] = 0.08;
        this.vx[idx] = Math.sin(v * Math.PI * 2 + ph) * 0.42;
        this.vy[idx] = Math.cos(u * Math.PI * 2.5 - ph) * 0.36;
      }
    }
    this._injectVortex(-0.22, -0.10, 0.38, 2.2);
    this._injectVortex(0.24, 0.14, 0.38, -2.2);
    for (let s = 0; s < 12; s++) this._stepFluid(0.025);
  }

  _injectRadialJet(ndcX, ndcY, dirX, dirY, strength) {
    const { nx, ny, vx, vy, thick, shimmer } = this;
    const gx = ((ndcX / 2.35) + 0.5) * (nx - 1);
    const gy = (((ndcY - 0.04) / 1.55) + 0.5) * (ny - 1);
    const rx = nx * 0.15;
    const ry = ny * 0.18;
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
        vx[idx] += dirX * strength * w;
        vy[idx] += dirY * strength * w;
        const freshD = 0.28 + 0.38 * Math.sin((dx * dirY - dy * dirX) * 3.4 + this.time * 4.2);
        thick[idx] += (freshD - thick[idx]) * Math.min(0.18, w * 0.12);
        shimmer[idx] = Math.min(1, shimmer[idx] + w * 0.07);
      }
    }
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
    const gx = ((ndcX / 2.35) + 0.5) * (this.nx - 1);
    const gy = (((ndcY - 0.04) / 1.55) + 0.5) * (this.ny - 1);
    const rx = (radiusNdc / 2.35) * this.nx;
    const ry = (radiusNdc / 1.55) * this.ny;
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

    // Pending auto-close shortly after popping an action bud
    if (this.autoCloseTimer > 0) {
      this.autoCloseTimer -= h;
      if (this.autoCloseTimer <= 0) {
        this.autoCloseTimer = -1;
        this.close();
      }
    }

    // 1. Update each radial bud's mitosis progress, catenoid neck, spring position & pop state
    let budVolSum = 0;
    let openSum = 0;
    let activeMotion = 0;
    let maxBudU = 0;

    for (let i = 0; i < this.budCount; i++) {
      const b = this.buds[i];

      if (b.popping) {
        b.popT += h;
        const popDur = 0.145;
        const pu = Math.min(1.0, b.popT / popDur);
        b.charge = pu * pu;
        b.neckK = 0;
        b.stretch *= Math.exp(-16 * h);

        // Rapid tension swell right before bursting!
        const targetR = this.rBudOpenCss * (1.0 + 0.36 * Math.pow(pu, 1.5));
        b.rVel += ((targetR - b.rCss) * 380 - b.rVel * 18) * h;
        b.rCss = Math.max(0, b.rCss + b.rVel * h);

        // Micro high-frequency tremble right at critical pressure
        b.wobPhase += (b.wobFreq + pu * 14) * h;
        b.wobAmp = 0.06 + pu * 0.085;
        activeMotion = Math.max(activeMotion, 0.85);

        if (b.popT >= popDur) {
          // POP! Rupture ring + 3D droplet mist + floating confirmation echo
          b.popping = false;
          b.popped = true;
          b.charge = 0;
          b.u = 0;
          b.targetU = 0;

          this.popRing = {
            active: true,
            xCss: b.xCss,
            yCss: b.yCss,
            rCss: b.rCss * 0.85,
            maxRCss: b.rCss * 2.45,
            t: 0,
            dur: 0.38,
          };
          this.toast = {
            active: true,
            text: this.actions[i].confirm,
            xCss: b.xCss,
            yCss: b.yCss,
            t: 0,
            dur: 1.15,
          };

          this._spawnPopMist(b);
          this._impulseZ(this._toNdcX(b.xCss), this._toNdcY(b.yCss), 0.52, 0.34);
          this.audio?.playPop(0.88);
          b.rCss = 0;
          b.rVel = 0;

          // After a short savor beat, smoothly retract remaining buds back into the hub
          this.autoCloseTimer = 0.22;
        }
      } else if (b.popped) {
        b.rCss = 0;
        b.neckK = 0;
        b.charge = 0;
      } else {
        // Stagger delay countdown
        if (b.delay > 0) {
          b.delay = Math.max(0, b.delay - h);
        } else {
          const opening = b.targetU > b.u;
          const speed = opening ? 1.68 : 2.15;
          if (Math.abs(b.targetU - b.u) > 0.0005) {
            const stepU = Math.sign(b.targetU - b.u) * speed * h;
            b.u = opening ? Math.min(b.targetU, b.u + stepU) : Math.max(b.targetU, b.u + stepU);
            activeMotion = Math.max(activeMotion, 0.9);
          } else {
            b.u = b.targetU;
          }
        }

        const u = b.u;
        const ePos = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        const isHov = (this.hovered === i && u > 0.65);

        // Hover subtly lifts bud outward 4px and swells radius +3px
        const targetDist = u > 0.001
          ? (this.rClosedCss * 0.22 + (this.orbitRCss - this.rClosedCss * 0.22) * ePos + (isHov ? 4.0 * this.scale : 0))
          : 0;

        // Radius emerges plumply from the hub membrane as bud extrudes
        const rEase = Math.min(1.0, u / 0.68);
        const rSmooth = rEase * rEase * (3.0 - 2.0 * rEase);
        const targetR = u > 0.002 ? (this.rBudOpenCss * rSmooth + (isHov ? 2.8 * this.scale : 0)) : 0;

        b.distVel += ((targetDist - b.distCss) * 230 - b.distVel * 17.5) * h;
        b.distCss = Math.max(0, b.distCss + b.distVel * h);

        b.rVel += ((targetR - b.rCss) * 245 - b.rVel * 17.8) * h;
        b.rCss = Math.max(0, b.rCss + b.rVel * h);
        if (u <= 0.002 && b.rCss < 1.2) b.rCss = 0;

        // Analytical radial catenoid neck peaks cleanly during extrusion/absorption (u ≈ 0.06..0.72)
        let targetK = 0;
        if (u > 0.05 && u < 0.72) {
          const mid = 0.40;
          const half = 0.34;
          const dMid = Math.abs(u - mid);
          if (dMid < half) {
            const q = 1.0 - dMid / half;
            const bell = q * q * (3.0 - 2.0 * q);
            targetK = 0.275 * bell;
          }
        }
        const kRate = targetK > b.neckK ? 26.0 : 22.0;
        b.neckK += (targetK - b.neckK) * Math.min(1, h * kRate);
        if (b.neckK < 0.0015 && targetK === 0) b.neckK = 0;

        // Exact mathematical catenoid connectivity: smin(dHub, dBud, k) bridges when surface gap < k * 0.50!
        const gapNdc = this._pxToNdc(b.distCss - (this.hub.rCss + b.rCss));
        const isConnected = b.rCss > 4 && b.neckK > 0.01 && (gapNdc < b.neckK * 0.50);

        // Detect exact frame the radial catenoid neck snaps free on outward mitosis!
        if (b.targetU > 0.5 && b.wasConnected && !isConnected && u > 0.35) {
          b.wobAmp = Math.max(b.wobAmp, 0.13);
          this.hub.wobAmp = Math.max(this.hub.wobAmp, 0.075);
          this._spawnPinchDroplets(b);
          const angNdc = -b.angCss;
          this._injectRadialJet(
            this._toNdcX((this.hub.xCss + b.xCss) * 0.5),
            this._toNdcY((this.hub.yCss + b.yCss) * 0.5),
            Math.cos(angNdc), Math.sin(angNdc), 3.6
          );
          this.audio?.playBudSplit(i);
        }
        b.wasConnected = isConnected;

        // Inject continuous Marangoni rainbow stream while liquid neck is stretching!
        if (isConnected) {
          const dirSign = b.targetU > 0.5 ? 1 : -1;
          const angNdc = -b.angCss;
          this._injectRadialJet(
            this._toNdcX((this.hub.xCss + b.xCss) * 0.5),
            this._toNdcY((this.hub.yCss + b.yCss) * 0.5),
            Math.cos(angNdc) * dirSign, Math.sin(angNdc) * dirSign,
            2.4 * h * 18
          );
        }

        // Stretch teardrop subtly along radial axis ONLY while connected by liquid meniscus
        const targetStretch = isConnected ? Math.min(1.0, b.neckK / 0.18) : 0;
        b.stretch += (targetStretch - b.stretch) * Math.min(1, h * 16);

        // Airy floating bob once detached in orbit
        const bobAmp = Math.max(0, (u - 0.55) / 0.45);
        const bobY = Math.sin(this.time * 2.25 + i * 1.35) * 2.4 * this.scale * bobAmp;
        const bobX = Math.cos(this.time * 1.75 + i * 1.9) * 1.1 * this.scale * bobAmp;
        b.xCss = this.hubBaseX + Math.cos(b.angCss) * b.distCss + bobX;
        b.yCss = this.hubBaseY + Math.sin(b.angCss) * b.distCss + bobY;

        b.wobPhase += b.wobFreq * h;
        b.wobAmp *= Math.exp(-4.3 * h);

        // Accumulate 3D spherical volume of all emerging buds for exact hub volume conservation!
        budVolSum += b.rCss * b.rCss * b.rCss;
        openSum += u;
        maxBudU = Math.max(maxBudU, u);
      }
    }

    // Fire warm coalescence arrival bounce when closing buds finish re-absorbing into hub!
    if (this.mergeSoundPending && !this.isOpen && maxBudU < 0.18) {
      this.mergeSoundPending = false;
      this.hub.wobAmp = Math.max(this.hub.wobAmp, 0.125);
      this.hub.rVel += 52 * this.scale;
      this._impulseZ(this._toNdcX(this.hubBaseX), this._toNdcY(this.hubBaseY), 0.34, 0.36);
      this.audio?.playBudMerge();
    }

    // 2. Exact 3D spherical volume-conserving central hub physics!
    const vClosed = this.rClosedCss * this.rClosedCss * this.rClosedCss;
    const vHubMin = this.rHubOpenCss * this.rHubOpenCss * this.rHubOpenCss;
    const hubHoverBoost = (this.hovered === 'hub') ? 2.2 * this.scale : 0;
    const targetHubR = Math.cbrt(Math.max(vHubMin, vClosed - budVolSum)) + hubHoverBoost;

    const targetOpenBlend = this.isOpen ? 1.0 : Math.min(1.0, openSum / 3.2);
    this.openBlend += (targetOpenBlend - this.openBlend) * Math.min(1, h * 11.0);

    const hubBob = Math.sin(this.time * 1.95) * (1.8 - this.openBlend * 0.6) * this.scale;
    const targetHubY = this.hubBaseY + hubBob + (this.hovered === 'hub' ? -1.8 * this.scale : 0);

    this.hub.rVel += ((targetHubR - this.hub.rCss) * 215 - this.hub.rVel * 16.5) * h;
    this.hub.rCss = Math.max(16, this.hub.rCss + this.hub.rVel * h);

    this.hub.yVel += ((targetHubY - this.hub.yCss) * 150 - this.hub.yVel * 14.0) * h;
    this.hub.yCss += this.hub.yVel * h;

    this.hub.squashVel += ((0 - this.hub.squash) * 220 - this.hub.squashVel * 15.0) * h;
    this.hub.squash += this.hub.squashVel * h;

    this.hub.wobPhase += this.hub.wobFreq * h;
    this.hub.wobAmp *= Math.exp(-4.0 * h);

    this.activity += (activeMotion - this.activity) * Math.min(1, h * 7.0);
    if (activeMotion < 0.1) {
      // Gentle living ambient vortex inside the hub
      this._injectVortex(0.0, -0.18 + Math.sin(this.time * 1.3) * 0.08, 0.36, 0.42 * h * 13);
    }

    // 3. Expanding soap rupture ring & floating confirmation echo
    if (this.popRing.active) {
      this.popRing.t += h;
      const u = Math.min(1.0, this.popRing.t / this.popRing.dur);
      const ease = 1.0 - Math.pow(1.0 - u, 2.4);
      this.popRing.rCss = this.rBudOpenCss * 0.92 + (this.popRing.maxRCss - this.rBudOpenCss * 0.92) * ease;
      if (this.popRing.t >= this.popRing.dur) this.popRing.active = false;
    }
    if (this.toast.active) {
      this.toast.t += h;
      if (this.toast.t >= this.toast.dur) this.toast.active = false;
    }

    // 4. Fluid + capillary wave grid step
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

    // 5. Floating satellite droplets (pinch-off & pop mist)
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

  _drawActionIcon(ctx, id, cx, cy, sz, strokeCol, lineW) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = strokeCol;
    ctx.fillStyle = strokeCol;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const s = sz * 0.5;

    if (id === 'camera') {
      // Minimalist rounded camera body + top prism hump + crisp circular lens
      const w = s * 0.94, h = s * 0.68, r = s * 0.24;
      ctx.beginPath();
      ctx.moveTo(-w + r, -h * 0.72);
      ctx.lineTo(-s * 0.36, -h * 0.72);
      ctx.lineTo(-s * 0.22, -h * 1.06);
      ctx.lineTo(s * 0.22, -h * 1.06);
      ctx.lineTo(s * 0.36, -h * 0.72);
      ctx.lineTo(w - r, -h * 0.72);
      ctx.quadraticCurveTo(w, -h * 0.72, w, -h * 0.72 + r);
      ctx.lineTo(w, h - r);
      ctx.quadraticCurveTo(w, h, w - r, h);
      ctx.lineTo(-w + r, h);
      ctx.quadraticCurveTo(-w, h, -w, h - r);
      ctx.lineTo(-w, -h * 0.72 + r);
      ctx.quadraticCurveTo(-w, -h * 0.72, -w + r, -h * 0.72);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, s * 0.10, s * 0.34, 0, Math.PI * 2);
      ctx.stroke();
    } else if (id === 'note') {
      // Minimalist note page with subtle diagonal edit nib / lines
      const w = s * 0.72, h = s * 0.84, r = s * 0.22;
      ctx.beginPath();
      ctx.moveTo(-w + r, -h);
      ctx.lineTo(w - r, -h);
      ctx.quadraticCurveTo(w, -h, w, -h + r);
      ctx.lineTo(w, h - r);
      ctx.quadraticCurveTo(w, h, w - r, h);
      ctx.lineTo(-w + r, h);
      ctx.quadraticCurveTo(-w, h, -w, h - r);
      ctx.lineTo(-w, -h + r);
      ctx.quadraticCurveTo(-w, -h, -w + r, -h);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-s * 0.34, -s * 0.28);
      ctx.lineTo(s * 0.34, -s * 0.28);
      ctx.moveTo(-s * 0.34, s * 0.08);
      ctx.lineTo(s * 0.34, s * 0.08);
      ctx.moveTo(-s * 0.34, s * 0.44);
      ctx.lineTo(s * 0.12, s * 0.44);
      ctx.stroke();
    } else if (id === 'mic') {
      // Minimalist studio capsule mic + U-cradle + stand
      const mw = s * 0.30, mh = s * 0.46;
      ctx.beginPath();
      ctx.moveTo(-mw, -mh * 0.45);
      ctx.arc(0, -mh * 0.45, mw, Math.PI, 0, false);
      ctx.lineTo(mw, mh * 0.32);
      ctx.arc(0, mh * 0.32, mw, 0, Math.PI, false);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, mh * 0.25, s * 0.56, 0.12 * Math.PI, 0.88 * Math.PI, false);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, mh * 0.25 + s * 0.56);
      ctx.lineTo(0, s * 0.90);
      ctx.moveTo(-s * 0.30, s * 0.90);
      ctx.lineTo(s * 0.30, s * 0.90);
      ctx.stroke();
    } else if (id === 'link') {
      // Minimalist diagonal interlocking link capsules
      ctx.rotate(-Math.PI * 0.25);
      const cw = s * 0.44, ch = s * 0.26;
      // Left half-capsule
      ctx.beginPath();
      ctx.moveTo(-s * 0.14, -ch);
      ctx.lineTo(-s * 0.48, -ch);
      ctx.arc(-s * 0.48, 0, ch, -Math.PI * 0.5, Math.PI * 0.5, true);
      ctx.lineTo(-s * 0.14, ch);
      ctx.stroke();
      // Right half-capsule
      ctx.beginPath();
      ctx.moveTo(s * 0.14, -ch);
      ctx.lineTo(s * 0.48, -ch);
      ctx.arc(s * 0.48, 0, ch, -Math.PI * 0.5, Math.PI * 0.5, false);
      ctx.lineTo(s * 0.14, ch);
      ctx.stroke();
      // Connecting center bar
      ctx.beginPath();
      ctx.moveTo(-cw * 0.65, 0);
      ctx.lineTo(cw * 0.65, 0);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawUnderIcons() {
    const ctx = this.underCtx;
    const dpr = this.dpr;
    const W = this.underCanvas.width;
    const H = this.underCanvas.height;
    ctx.clearRect(0, 0, W, H);

    // 1. Central hub '+' icon smoothly rotating 45deg into '×' as buds emerge!
    {
      const hFrac = Math.max(0, Math.min(1, (this.hub.rCss - this.rHubOpenCss) / Math.max(1, this.rClosedCss - this.rHubOpenCss)));
      const arm = (9.0 + hFrac * 4.2) * this.scale * dpr;
      const lineW = (2.05 + hFrac * 0.35) * this.scale * dpr;
      const alpha = 0.78 + hFrac * 0.14 + (this.hovered === 'hub' ? 0.08 : 0);

      ctx.save();
      ctx.translate(this.hub.xCss * dpr, this.hub.yCss * dpr);
      ctx.rotate(this.openBlend * Math.PI * 0.25);
      ctx.strokeStyle = `rgba(22, 24, 38, ${Math.min(0.96, alpha)})`;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-arm, 0);
      ctx.lineTo(arm, 0);
      ctx.moveTo(0, -arm);
      ctx.lineTo(0, arm);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Orbiting action bud icons + airy labels (fade cleanly outside the liquid necks)
    for (let i = 0; i < this.budCount; i++) {
      const b = this.buds[i];
      if (b.popped || b.rCss < 4) continue;
      const item = this.actions[i];
      const iconFade = Math.max(0, Math.min(1, (b.u - 0.16) / 0.38));
      const isHov = (this.hovered === i);

      if (iconFade > 0.01) {
        const sizeScale = Math.min(1.22, b.rCss / Math.max(1, this.rBudOpenCss));
        const iconSz = 18.8 * sizeScale * this.scale * dpr;
        const lineW = (1.78 + (isHov ? 0.2 : 0)) * this.scale * dpr;
        const inkAlpha = (0.72 + (isHov ? 0.22 : 0) + b.charge * 0.20) * iconFade;
        const strokeCol = `rgba(22, 24, 38, ${Math.min(0.96, inkAlpha)})`;
        this._drawActionIcon(ctx, item.id, b.xCss * dpr, b.yCss * dpr, iconSz, strokeCol, lineW);
      }

      // Crisp minimal label positioned slightly above/outside each detached bud
      const labelFade = Math.max(0, Math.min(1, (b.u - 0.64) / 0.30)) * (1.0 - b.charge * 0.85);
      if (labelFade > 0.01) {
        const lx = b.xCss + Math.cos(b.angCss) * 8.5 * this.scale;
        const ly = b.yCss - this.rBudOpenCss - 13.5 * this.scale;
        ctx.save();
        ctx.font = `${isHov ? 600 : 500} ${11.2 * this.scale * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(28, 30, 44, ${(isHov ? 0.90 : 0.56) * labelFade})`;
        ctx.fillText(item.label, lx * dpr, ly * dpr);
        ctx.restore();
      }
    }

    // 3. Subtle floating confirmation echo right where a popped action burst!
    if (this.toast.active) {
      const u = this.toast.t / this.toast.dur;
      const fadeIn = Math.min(1.0, u / 0.14);
      const fadeOut = u > 0.62 ? Math.max(0.0, 1.0 - (u - 0.62) / 0.38) : 1.0;
      const a = fadeIn * fadeOut;
      if (a > 0.01) {
        const rise = 14.0 * this.scale * (1.0 - Math.pow(1.0 - u, 2.0));
        ctx.save();
        ctx.font = `600 ${12.2 * this.scale * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(22, 24, 38, ${0.86 * a})`;
        ctx.fillText(`✓  ${this.toast.text}`, this.toast.xCss * dpr, (this.toast.yCss - rise) * dpr);
        ctx.restore();
      }
    }
  }

  render() {
    this._drawUnderIcons();

    const { gl, u } = this;
    gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.nx, this.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.texData);

    const hubMass = Math.max(0, Math.min(1, (this.hub.rCss - this.rHubOpenCss) / Math.max(1, this.rClosedCss - this.rHubOpenCss)));
    gl.uniform1i(u.uSim, 0);
    gl.uniform2f(u.uRes, this.glCanvas.width, this.glCanvas.height);
    gl.uniform2f(u.uSize, this.width, this.height);
    gl.uniform1f(u.uTime, this.time);

    gl.uniform4f(
      u.uHub,
      this._toNdcX(this.hub.xCss),
      this._toNdcY(this.hub.yCss),
      this._pxToNdc(this.hub.rCss),
      this.hub.wobAmp
    );
    gl.uniform4f(u.uHubMeta, this.hub.wobPhase, hubMass, this.openBlend, this.hub.squash);

    for (let i = 0; i < this.budCount; i++) {
      const b = this.buds[i];
      const o = i * 4;
      this.budPosBuf[o]     = this._toNdcX(b.xCss);
      this.budPosBuf[o + 1] = this._toNdcY(b.yCss);
      this.budPosBuf[o + 2] = this._pxToNdc(b.rCss);
      this.budPosBuf[o + 3] = b.wobAmp;

      // Convert CSS angle (Y-down) to NDC angle (Y-up) for shader radial elongation & neck axis!
      this.budMetaBuf[o]     = b.wobPhase;
      this.budMetaBuf[o + 1] = b.neckK;
      this.budMetaBuf[o + 2] = b.stretch;
      this.budMetaBuf[o + 3] = -b.angCss;
    }
    gl.uniform4fv(u.uBuds, this.budPosBuf);
    gl.uniform4fv(u.uBudMeta, this.budMetaBuf);
    gl.uniform4f(u.uBudCharge, this.buds[0].charge, this.buds[1].charge, this.buds[2].charge, this.buds[3].charge);

    if (this.popRing.active) {
      const pu = this.popRing.t / this.popRing.dur;
      const ringAlpha = Math.pow(Math.max(0, 1.0 - pu), 1.55);
      gl.uniform4f(
        u.uPopRing,
        this._toNdcX(this.popRing.xCss),
        this._toNdcY(this.popRing.yCss),
        this._pxToNdc(this.popRing.rCss),
        ringAlpha
      );
    } else {
      gl.uniform4f(u.uPopRing, 0, 0, 0, 0);
    }
    gl.uniform1f(u.uActivity, this.activity);

    // Upload delicate satellite droplets (pinch-off + pop mist)
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
