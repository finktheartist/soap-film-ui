// ============================================================================
// HOLD-TO-SEND / HOLD-TO-APPROVE — BOUNDARY-PINNED SOAP WAND ENGINE
// ============================================================================
// The button boundary itself acts as a frameless glass soap wand: holding blows
// a luminous 3D soap bubble directly UP & OUT of the pill rim with a real curved
// catenoid meniscus neck (100% flush along the bottom/sides, zero droop below!).
// Release early -> retracts smoothly back into the rim. Hit 100% -> Culick pop!

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

uniform sampler2D uSim;      // R: thickness, G: z-wave, B: shimmer
uniform vec2 uRes;
uniform vec2 uSize;
uniform vec2 uPillHalf;      // frameless etched-glass pill half-size
uniform float uPillY;        // vertical center of pill in local coords
uniform float uWireR;
uniform float uTime;

uniform float uProgress;     // 0..1 hold charge
uniform float uOrbProg;      // spring-smoothed inflation progress 0..1
uniform float uInflate;      // elastic dome breathing
uniform float uBubbleAlpha;  // 0..1 bubble visibility (rises on hold, 0 after pop)
uniform vec2 uOrbCenter;     // rising blown sphere center
uniform float uOrbR;         // rising blown sphere radius
uniform vec2 uWobble;        // (wob2, wob3) elastic jelly modes
uniform float uTension;      // 0..1 critical pre-pop tension shimmer (>70%)
uniform float uPressScale;   // subtle tactile pill depression on press
uniform float uSentFlash;    // 0..1 confirmation iridescent pulse on pop!
uniform float uSentState;    // 0..1 confirmed state

// Culick rupture hole at 100% pop!
uniform float uRuptureR;
uniform vec2 uRupturePos;

// True 3D optical daughter soap bubbles pinched off during Culick rupture!
const int MAX_DAUGHTERS = 16;
uniform vec4 uDPos[MAX_DAUGHTERS]; // x, y, radius (NDC), alpha
uniform vec4 uDOpt[MAX_DAUGHTERS]; // dNmBase (nm), wobAmp, wobPhase, age

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

// High-chroma stylized-physical thin-film interference spectrum
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
  col = pow(clamp(col, 0.0, 1.25), vec3(0.92));

  float newton = smoothstep(14.0, 62.0, dNm);
  return clamp(col * newton, 0.0, 1.25);
}

vec3 bubbleSpeculars(vec3 N, float NdotV, vec2 pNorm, float time, float starBoost) {
  vec3 V = vec3(0.0, 0.0, 1.0);

  vec3 L1 = normalize(vec3(-0.56, 0.78, 0.46));
  vec3 H1 = normalize(L1 + V);
  float ndh1 = max(0.0, dot(N, H1));
  float arc1 = smoothstep(0.86, 0.94, ndh1) * 0.78 + smoothstep(0.955, 0.990, ndh1) * 0.98;

  vec3 L2 = normalize(vec3(0.68, -0.58, 0.42));
  vec3 H2 = normalize(L2 + V);
  float ndh2 = max(0.0, dot(N, H2));
  float arc2 = smoothstep(0.88, 0.96, ndh2) * 0.54;

  float skyArc = smoothstep(0.22, 0.90, -pNorm.x * 0.55 + pNorm.y * 0.85) * smoothstep(0.16, 0.80, 1.0 - NdotV) * 0.28;

  // Optical 4-ray + diagonal diamond starburst glint on upper-left shoulder of rising sphere
  vec2 starCenter = vec2(-0.44, 0.52);
  vec2 dStar = (pNorm - starCenter) * 3.4;
  float rStar = length(dStar);
  float rayH = exp(-abs(dStar.y) * 26.0) * exp(-abs(dStar.x) * 4.0);
  float rayV = exp(-abs(dStar.x) * 26.0) * exp(-abs(dStar.y) * 4.0);
  vec2 dDiag = vec2(dStar.x + dStar.y, dStar.x - dStar.y) * 0.7071;
  float rayD = (exp(-abs(dDiag.y) * 34.0) * exp(-abs(dDiag.x) * 7.0)
              + exp(-abs(dDiag.x) * 34.0) * exp(-abs(dDiag.y) * 7.0)) * 0.50;
  float coreDot = exp(-rStar * rStar * 22.0);
  float twinkle = 0.84 + 0.16 * sin(time * (4.5 + starBoost * 5.5) + pNorm.x * 2.0);
  float starburst = (coreDot * 0.98 + (rayH + rayV + rayD) * smoothstep(0.82, 0.0, rStar) * 0.92)
                  * twinkle * smoothstep(0.38, 0.82, ndh1 + 0.18) * starBoost;

  return vec3(clamp(arc1 + arc2 + skyArc + starburst, 0.0, 1.55), skyArc, starburst);
}

vec4 evalGlassCapillary(float sdTrack, vec2 gradDir, float trackW, vec3 tintBounce, float wetness, float visibility) {
  if (visibility <= 0.002) return vec4(0.0);
  float aa = 1.6 / uRes.y;
  float dAbs = abs(sdTrack);
  float mask = smoothstep(trackW + aa, trackW - aa, dAbs);
  if (mask <= 0.001) return vec4(0.0);

  vec2 L = normalize(vec2(-0.62, 0.78));
  float directional = dot(gradDir, L);
  float edgeProfile = 1.0 - clamp(dAbs / trackW, 0.0, 1.0);
  float coreGlow = pow(edgeProfile, 1.4);

  vec3 grooveShadow = vec3(0.30, 0.34, 0.50);
  vec3 catchlight = vec3(0.75, 0.78, 0.88);
  vec3 col = mix(grooveShadow, catchlight, smoothstep(-0.35, 0.48, -directional));
  col = mix(col, tintBounce * 0.85 + vec3(0.15), wetness * 0.52);
  float alpha = mask * visibility * (0.30 + 0.32 * coreGlow + 0.22 * abs(directional) + 0.22 * wetness);
  return vec4(clamp(col, 0.0, 1.25), clamp(alpha, 0.0, 0.94));
}

vec4 over(vec4 src, vec4 dst) {
  return vec4(src.rgb + dst.rgb * (1.0 - src.a), src.a + dst.a * (1.0 - src.a));
}

// Photorealistic 3D WebGL2 thin-film daughter soap bubble (same Snell/Airy optics as hero orb!)
vec4 evalDaughterBubble(vec2 p, vec4 posR, vec4 opt, float px) {
  float r = posR.z;
  float a = posR.w;
  if (r <= 0.001 || a <= 0.002) return vec4(0.0);

  vec2 dp = p - posR.xy;
  float wobAmp = opt.y;
  float rPad = r * (1.0 + abs(wobAmp) * 1.18) + px * 3.0;
  if (dot(dp, dp) > rPad * rPad) return vec4(0.0);

  // Authentic damped quadrupole + octupole pinch-off capillary oscillation
  float ang = atan(dp.y, dp.x);
  float phase = opt.z;
  float wob = wobAmp * (0.72 * cos(2.0 * ang + phase) + 0.28 * sin(3.0 * ang - phase * 1.35));
  float rEff = max(0.0025, r * (1.0 + wob));
  float dist = length(dp);
  float sd = dist - rEff;
  float mask = smoothstep(px * 1.35, -px * 1.35, sd);
  if (mask <= 0.001) return vec4(0.0);

  vec2 nXY = dp / max(rEff, 0.004);
  float r2 = clamp(dot(nXY, nXY), 0.0, 0.992);
  float nz = sqrt(max(0.06, 1.0 - r2));
  // Gentle living capillary swirl across the daughter bubble film
  vec2 swirlN = 0.055 * vec2(
    sin(nXY.y * 3.8 + uTime * 2.4 + phase),
    cos(nXY.x * 3.4 - uTime * 2.1 + phase * 1.3)
  );
  vec3 N = normalize(vec3(nXY + swirlN * (1.0 - r2 * 0.55), nz));
  float NdotV = clamp(N.z, 0.06, 1.0);
  float fres = pow(1.0 - NdotV, 2.20);
  float razorRim = pow(1.0 - NdotV, 4.7);

  // Gravity drainage (thinner at apex, thicker bands near base) + live swirling film thickness
  float drainGrad = (0.5 - 0.5 * nXY.y) * 165.0;
  float swirlBand = 115.0 * sin(nXY.x * 2.5 - nXY.y * 3.0 + uTime * 2.0 + phase);
  float dNm = opt.x + drainGrad + swirlBand + fres * 230.0;
  float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
  float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
  vec3 irid = bubbleIridescence(dNm, cosTheta);

  // True 3D dual studio-window reflections matching the hero soap bubble lighting
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

  // Resolution-adaptive crisp optical rim contour so even 3px micro-bubbles look razor glassy on white
  float rNorm = sqrt(r2);
  float rimOff = max(0.055, min(0.16, px * 1.15 / max(rEff, 0.004)));
  float innerContour = exp(-pow((1.0 - rNorm - rimOff) / max(0.042, rimOff * 0.72), 2.0));
  float hairOff = min(0.045, px * 0.48 / max(rEff, 0.004));
  float outerHair = exp(-pow((1.0 - rNorm - hairOff) / max(0.024, px * 0.55 / max(rEff, 0.004)), 2.0));

  vec3 contourCol = mix(vec3(0.34, 0.39, 0.65), irid * 0.64 + vec3(0.16, 0.15, 0.32), 0.52);
  vec3 domeCol = mix(vec3(0.95, 0.97, 1.0), irid * 0.94 + vec3(0.14, 0.16, 0.24), 0.88);
  vec3 col = mix(vec3(0.98, 0.99, 1.0), domeCol, clamp(0.12 + fres * 0.82, 0.0, 1.0));
  col = mix(col, contourCol, clamp(innerContour * 0.54 + razorRim * 0.44, 0.0, 0.78));
  float crescent = smoothstep(0.10, 0.76, fres) * (1.0 - outerHair * 0.62);
  col = mix(col, clamp(irid * 1.12 + vec3(0.08, 0.07, 0.12), 0.0, 1.0), crescent * 0.68);
  col = mix(col, vec3(1.0, 0.998, 1.0), clamp((spec1 + spec2 + skyArc) * 0.96 + outerHair * 0.84, 0.0, 0.99));

  // Hollow crystal-clear center (barely 5% tint inside -> rich luminous iridescence at grazing Fresnel rim!)
  float alpha = clamp(0.048 + fres * 0.76 + innerContour * 0.48 + outerHair * 0.72 + (spec1 + spec2 + skyArc) * 0.88, 0.0, 0.95);
  return vec4(col * (alpha * mask * a), alpha * mask * a);
}

// ============================================================================
// TRUE BOUNDARY-PINNED SOAP-WAND BUBBLE SDF!
// ============================================================================
// 1) Base is 100% sealed & pinned inside the EXACT pill button perimeter (sdBase).
// 2) Rising blown sphere erupts strictly UPWARD out of the button's top boundary.
// 3) Smooth catenoid liquid neck (smin) flares gracefully from the pill rim up
//    into the swelling orb, pinching tighter right before 100% pop!
// 4) Below the button midline, strictly clamped to sdBase -> ZERO sag below button!
float sdWandBubble(vec2 p, out float outNeckFactor) {
  vec2 ph = uPillHalf * uPressScale;
  vec2 pPill = p - vec2(0.0, uPillY);
  float sdBase = sdRoundedBox(pPill, ph, ph.y);

  // At 0% idle, keep the soap film strictly flush inside the rigid glass button boundary
  // (internal membrane wobble is driven smoothly in the 3D dome normals & fluid waves so
  // nothing pokes past the glass rim until you actually press & inflate!).
  float sdBaseLive = sdBase;

  // Rising buoyant blown sphere emerging upward out of the pill rim
  vec2 bp = p - uOrbCenter;
  float rSafe = max(0.06, uOrbR);
  float rNorm = length(bp) / rSafe;
  float theta = atan(bp.y, bp.x);
  float wobFade = smoothstep(0.10, 0.48, rNorm);

  // Elastic jelly wobble + mounting high-pressure capillary tremor near 90-100%
  float jelly = (uWobble.x * cos(2.0 * theta) + uWobble.y * cos(3.0 * theta + 0.9)) * 0.026 * smoothstep(0.08, 0.65, uOrbProg);
  float tremor = uTension * (0.013 * sin(5.0 * theta + uTime * 28.0) + 0.008 * cos(7.0 * theta - uTime * 34.0));

  // Subtle upward buoyant teardrop stretch as the orb strains off the wand near 80-100%
  float liftStretch = 1.0 + 0.08 * smoothstep(0.50, 1.0, uOrbProg);
  vec2 sp = vec2(bp.x * sqrt(liftStretch), bp.y / liftStretch);
  // Subtle organic widening near base at very low progress (0-25%) so the blister spans the pill top cleanly!
  float earlyWide = 1.0 + 0.55 * (1.0 - smoothstep(0.05, 0.52, uOrbProg));
  sp.x /= earlyWide;
  float sdOrb = (length(sp) - rSafe) * min(1.0 / liftStretch, earlyWide) - (jelly + tremor) * wobFade;

  // Real physical catenoid soap-wand neck!
  float kNeck = mix(0.03, 0.22, smoothstep(0.03, 0.48, uOrbProg))
              * mix(1.0, 0.54, smoothstep(0.68, 1.0, uOrbProg));
  float dUnion = smin(sdBaseLive, sdOrb, kNeck);

  // Identify neck/collar region (where the rising bubble flares off the button boundary!)
  outNeckFactor = exp(-abs(sdBase - sdOrb) * 14.0) * smoothstep(0.08, 0.35, uOrbProg)
                * smoothstep(uPillY - 0.02, uPillY + ph.y * 0.8, p.y);

  // STRICT BOTTOM PINNING: below the button's horizontal midline, clamp strictly to sdBase
  // so the bubble NEVER bleeds or droops below the bottom boundary of the button!
  float belowPin = smoothstep(uPillY + 0.03, uPillY - 0.04, p.y);
  return mix(dUnion, max(dUnion, sdBase), belowPin);
}

void main() {
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2((vUv.x * 2.0 - 1.0) * aspect, (vUv.y * 2.0 - 1.0));
  float px = 2.0 / uSize.y;

  vec4 outCol = vec4(0.0);

  vec2 ph = uPillHalf * uPressScale;
  vec2 pPill = p - vec2(0.0, uPillY);
  float sdPill = sdRoundedBox(pPill, ph, ph.y);
  float insidePill = smoothstep(px * 2.0, -px * 2.0, sdPill);

  // --- 1. SUBTLE RECESSED BUTTON SURFACE + SENT CONFIRMATION WASH ---
  // Only shade the recessed pill interior when the soap film isn't covering it (or after pop in Sent state)
  // so ZERO sharp horizontal tint step ever appears along the pill top edge while the bubble rises through it!
  float soapPresent = uBubbleAlpha * (uRuptureR > 0.001 ? smoothstep(-px * 2.8, px * 2.8, length(p - uRupturePos) - uRuptureR) : 1.0);
  if (insidePill > 0.001) {
    float baseA = 0.036 * (1.0 - soapPresent) + 0.048 * uSentState;
    if (baseA > 0.001) {
      vec3 baseC = mix(vec3(0.20, 0.24, 0.42), vec3(0.14, 0.52, 0.44), uSentState * 0.72);
      outCol = over(vec4(baseC * (baseA * insidePill), baseA * insidePill), outCol);
    }

    if (uSentFlash > 0.01) {
      float ring = exp(-pow((length(pPill) - (1.0 - uSentFlash) * 0.9) * 10.0, 2.0));
      vec3 flashC = mix(vec3(0.35, 0.88, 0.72), vec3(0.68, 0.58, 1.0), 0.45);
      float fa = (uSentFlash * 0.24 + ring * uSentFlash * 0.38) * insidePill;
      outCol = over(vec4(flashC * fa, fa), outCol);
    }
  }

  // --- 2. SOFT FLOATING SHADOW BENEATH THE RISING BUBBLE ---
  float neckFactor = 0.0;
  float sdBubble = sdWandBubble(p, neckFactor);
  if (uBubbleAlpha > 0.005) {
    float dummyN;
    vec2 shOff = vec2(-0.018, 0.048 + 0.055 * uOrbProg);
    float sdSh = sdWandBubble(p + shOff, dummyN);
    // Keep shadow airy and focused around the rising upper orb, AND dissolve it smoothly in exact sync
    // with the expanding Culick rupture hole so ZERO ghost shadow lingers in empty air after pop!
    float shRupture = (uRuptureR > 0.001)
      ? smoothstep(-0.10, 0.16, length((p + shOff) - uRupturePos) - uRuptureR)
      : 1.0;
    float riseShadow = smoothstep(uPillY - 0.08, uPillY + 0.28, p.y);
    float blurW = 0.14 + 0.16 * uOrbProg;
    float bSh = smoothstep(blurW, -0.05, sdSh) * (0.04 + 0.055 * uOrbProg * riseShadow) * uBubbleAlpha * shRupture;
    outCol = over(vec4(vec3(0.24, 0.24, 0.42) * bSh, bSh), outCol);
  }

  // --- 3. CULICK RUPTURE HOLE AT 100% POP (SMOOTH BEADED LIQUID TORUS RIM!) ---
  float ruptureMask = 1.0;
  float ruptureRim = 0.0;
  if (uRuptureR > 0.001) {
    vec2 dp = p - uRupturePos;
    float ang = atan(dp.y, dp.x);
    // Smooth organic surface-tension liquid undulations along the fast-retracting thickened rim (no jagged teeth!)
    float rimWave = (vnoise(vec2(ang * 5.0, uRuptureR * 3.0)) - 0.5) * 0.028
                  + (vnoise(vec2(ang * 11.0, uRuptureR * 6.0)) - 0.5) * 0.011
                  + sin(ang * 16.0 + uRuptureR * 10.0) * 0.0035;
    float dHole = length(dp) - (uRuptureR + rimWave);
    ruptureMask = smoothstep(-px * 2.2, px * 2.2, dHole);
    float beadSheen = 0.84 + 0.24 * sin(ang * 22.0 + uRuptureR * 14.0);
    ruptureRim = exp(-abs(dHole) * 44.0) * smoothstep(-0.014, 0.022, dHole + 0.010) * beadSheen;
  }

  // --- 4. BOUNDARY-ORIGINATING 3D VOLUMETRIC SOAP BUBBLE ---
  float orbMask = smoothstep(px * 2.2, -px * 2.2, sdBubble) * uBubbleAlpha * ruptureMask;
  vec3 filmBounceCol = vec3(0.66, 0.78, 0.98);

  if (orbMask > 0.001) {
    // True compound normal from exact SDF gradient blended smoothly with spherical interior dome!
    float eps = 0.004;
    float dN;
    vec2 gRim = normalize(vec2(
      sdWandBubble(p + vec2(eps, 0.0), dN) - sdWandBubble(p - vec2(eps, 0.0), dN),
      sdWandBubble(p + vec2(0.0, eps), dN) - sdWandBubble(p - vec2(0.0, eps), dN)
    ) + 1e-5);

    // Local depth relative to either the rising sphere radius or pill half-height
    float inUpperOrb = smoothstep(uPillY + ph.y * 0.25, uPillY + ph.y * 1.45, p.y);
    float localScale = mix(ph.y, max(ph.y, uOrbR), inUpperOrb);
    float dIn = max(0.0, -sdBubble);
    float rho = clamp(1.0 - dIn / max(0.10, localScale), 0.0, 0.998);

    // Smooth dome direction: pill-elliptic in the base, pure spherical in the rising upper orb!
    vec2 pNormBase = pPill / max(ph, vec2(0.08));
    vec2 pNormOrb = (p - uOrbCenter) / max(vec2(uOrbR), vec2(0.10));
    vec2 pNorm = mix(pNormBase, pNormOrb, inUpperOrb);
    vec2 smoothDir = normalize(pNorm + 1e-5);

    float rimBlend = smoothstep(0.32, 0.88, rho);
    vec2 domeDir = normalize(mix(smoothDir, gRim, rimBlend) + 1e-5);

    // Sample living Navier-Stokes fluid flowing UPWARD out of the button into the rising sphere!
    vec2 simCenter = vec2(0.0, uPillY + 0.34);
    vec2 simUv = clamp(((p - simCenter) / vec2(1.45, 1.45)) + 0.5, 0.004, 0.996);
    vec2 texel = 1.0 / vec2(textureSize(uSim, 0));
    vec4 simC = texture(uSim, simUv);
    float zL = texture(uSim, simUv - vec2(texel.x, 0.0)).g;
    float zR = texture(uSim, simUv + vec2(texel.x, 0.0)).g;
    float zD = texture(uSim, simUv - vec2(0.0, texel.y)).g;
    float zU = texture(uSim, simUv + vec2(0.0, texel.y)).g;
    vec2 gradZ = vec2(zR - zL, zU - zD) * 6.5;

    // Wet rim curl ONLY where the soap membrane actually terminates at the glass pill boundary!
    // Smoothly zeroes out as soon as dIn > 0.016 so once the rising bubble clears the top frame,
    // ZERO white or iridescent horizontal seam ever cuts across the emerging bubble throat!
    float rimDist = abs(sdPill);
    float edgePin = smoothstep(0.016, 0.0015, dIn);
    float collarPresence = mix(0.72, 1.0, smoothstep(0.02, 0.22, uOrbProg)) * edgePin;
    float wetCollar = exp(-rimDist * 34.0) * collarPresence;
    float tightCollar = exp(-rimDist * 82.0) * collarPresence;
    // Also restrict catenoid neckFactor strictly to the outer contour of the neck (never an interior line!)
    float neckRim = neckFactor * smoothstep(0.045, 0.004, dIn);
    vec2 gPill = normalize(vec2(
      sdRoundedBox(pPill + vec2(0.003, 0.0), ph, ph.y) - sdRoundedBox(pPill - vec2(0.003, 0.0), ph, ph.y),
      sdRoundedBox(pPill + vec2(0.0, 0.003), ph, ph.y) - sdRoundedBox(pPill - vec2(0.0, 0.003), ph, ph.y)
    ) + 1e-5);

    float radialR = clamp(length(pNorm * 0.94), 0.0, 1.0);
    float domeRadius = mix(radialR, rho, rimBlend);
    float puffPow = mix(1.32, 1.06, inUpperOrb * smoothstep(0.15, 0.85, uOrbProg));
    // Living capillary tilt wobble across the idle soap membrane so glossy highlight & rainbow bands gently wobble!
    float idleMembraneScale = mix(0.82, 1.0, smoothstep(0.0, 0.25, uOrbProg));
    vec2 idleWaveSlope = (1.0 - smoothstep(0.0, 0.30, uOrbProg)) * vec2(
      0.16 * sin(pNormBase.x * 2.5 + uTime * 2.9) * cos(pNormBase.y * 1.9 - uTime * 2.1),
      0.15 * cos(pNormBase.x * 2.1 - uTime * 2.5) * sin(pNormBase.y * 2.2 + uTime * 2.7)
    );
    float rimSteep = pow(clamp(domeRadius, 0.0, 0.995), puffPow) * (0.86 + 0.20 * uInflate) * idleMembraneScale;

    // Subtle inward curl at the pinched catenoid neck + wet grip along the pill rim!
    vec2 nXY = domeDir * rimSteep + gPill * wetCollar * 0.28 + idleWaveSlope - gradZ;
    if (ruptureRim > 0.02) {
      nXY -= normalize(p - uRupturePos + 1e-5) * ruptureRim * 1.25;
    }

    float nXY2 = dot(nXY, nXY);
    vec3 N = normalize(vec3(nXY, sqrt(max(0.06, 1.0 - min(0.94, nXY2)))));
    vec3 V = vec3(0.0, 0.0, 1.0);
    float NdotV = clamp(dot(N, V), 0.06, 1.0);
    float slopeMag = length(gradZ);

    float fres = pow(1.0 - NdotV, 2.25);
    float razorRim = pow(1.0 - NdotV, 4.8);
    float innerOutline = exp(-pow((dIn / max(0.10, localScale) - 0.050) * 26.0, 2.0));
    float outerWhiteHair = exp(-pow((dIn / max(0.10, localScale) - 0.014) * 58.0, 2.0));

    // Upward-flowing thin-film bands rising straight out of the button rim into the orb!
    float flowWave = 0.5 + 0.5 * sin(pNorm.x * 1.45 - pNorm.y * 1.55 + simC.r * 3.0 + uTime * (0.8 + 1.8 * uTension));
    float dNmBase = mix(120.0, 745.0, simC.r * 0.72 + flowWave * 0.28);
    float dNm = mix(dNmBase, 145.0 + 185.0 * flowWave, uTension * 0.48)
              + fres * 240.0 + wetCollar * 170.0 + neckRim * 140.0;

    float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
    float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
    vec3 irid = bubbleIridescence(dNm, cosTheta);
    filmBounceCol = mix(filmBounceCol, irid, 0.85);

    // Diamond starburst glints on the rising upper sphere + soft delicate glint on the idle soap film!
    float starBoost = mix(0.28, (0.35 + 1.05 * uOrbProg + 0.55 * uTension) * smoothstep(0.15, 0.75, inUpperOrb), smoothstep(0.02, 0.25, uOrbProg));
    vec2 specNorm = mix(pNormBase, pNormOrb, smoothstep(0.02, 0.30, uOrbProg));
    vec3 specInfo = bubbleSpeculars(N, NdotV, specNorm, uTime, starBoost);
    float specArc = specInfo.x;

    vec2 spGrid = (p + vec2(simC.r * 0.35, -simC.g * 0.25)) * 20.0;
    vec2 spCell = floor(spGrid);
    vec2 spF = fract(spGrid) - 0.5;
    float spRnd = hash21(spCell);
    float spDot = smoothstep(0.16, 0.02, length(spF)) * step(0.935 - uTension * 0.03, spRnd)
                * (0.45 + 0.55 * sin(uTime * (5.5 + uTension * 6.0) + spRnd * 40.0))
                * (0.35 + 0.65 * fres + simC.b + uTension * 0.55);

    vec3 contourCol = mix(vec3(0.36, 0.39, 0.68), irid * 0.65 + vec3(0.18, 0.16, 0.36), 0.52);
    vec3 domeColor = mix(vec3(0.92, 0.95, 1.0), irid * 0.92 + vec3(0.18, 0.20, 0.28), 0.86);

    vec3 col = mix(vec3(0.95, 0.96, 1.0), domeColor, clamp(0.22 + fres * 0.76 + wetCollar * 0.42 + neckRim * 0.35 + slopeMag * 0.45 + uTension * 0.16, 0.0, 1.0));
    col = mix(col, contourCol, clamp(innerOutline * 0.62 + razorRim * 0.46 + neckRim * 0.16, 0.0, 0.82));
    float crescentBand = smoothstep(0.08, 0.76, max(fres, max(wetCollar * 0.75, neckRim * 0.68))) * (1.0 - outerWhiteHair * 0.6);
    col = mix(col, clamp(irid * 1.10 + vec3(0.10, 0.08, 0.14), 0.0, 1.0), crescentBand * 0.64);

    float whiteGlow = clamp(specArc * 0.96 + outerWhiteHair * 0.86 + tightCollar * 0.72 + spDot * 0.95 + ruptureRim * 1.05, 0.0, 0.99);
    col = mix(col, vec3(1.0, 0.998, 1.0), whiteGlow);

    // Keep the pill center crystal-clear with a C-infinity soft Gaussian window (NEVER a sharp insidePill step!)
    // so "Hold to send · 84%" stays super crisp with ZERO horizontal edge along the top frame!
    vec2 textNorm = pPill / vec2(ph.x * 0.90, ph.y * 0.72);
    float pillClear = exp(-dot(textNorm, textNorm) * 1.45) * (1.0 - fres * 0.85) * 0.30;
    float alpha = clamp(
      (0.18 - pillClear) + fres * 0.76 + wetCollar * 0.52 + tightCollar * 0.58 + neckRim * 0.32
      + innerOutline * 0.58 + outerWhiteHair * 0.78 + specArc * 0.86 + slopeMag * 0.32 + ruptureRim * 0.96,
      0.0, 0.98
    );
    outCol = over(vec4(col * (alpha * orbMask), alpha * orbMask), outCol);
  }

  // --- 5. ETCHED CRYSTAL GLASS BUTTON BOUNDARY (THE SOAP-WAND RIM!) ---
  // Drawn crisp ON TOP of the base contact seam so you physically see the soap film
  // anchored cleanly inside and erupting upward FROM the button's exact glass boundary!
  {
    float eps = 0.002;
    vec2 gPill = normalize(vec2(
      sdRoundedBox(pPill + vec2(eps, 0.0), ph, ph.y) - sdRoundedBox(pPill - vec2(eps, 0.0), ph, ph.y),
      sdRoundedBox(pPill + vec2(0.0, eps), ph, ph.y) - sdRoundedBox(pPill - vec2(0.0, eps), ph, ph.y)
    ) + 1e-6);

    // Continuous, seam-free wet iridescent glow around the button boundary (NO atan wrap cut at top-center!)
    // Smoothly sweeps left-to-right as progress rises, keeping uniform glass hairline thickness everywhere.
    float sweepX = mix(-ph.x * 1.15, ph.x * 1.15, uProgress);
    float progFill = smoothstep(sweepX + 0.16, sweepX - 0.08, pPill.x) * smoothstep(0.0, 0.08, uProgress);
    vec3 progIrid = bubbleIridescence(210.0 + (pPill.x / max(0.1, ph.x)) * 180.0 + uTime * 110.0, 0.82);

    // Upper rim dissolves completely to 0 across the exact pixels where the soap blister lifts past the glass edge
    // (100% crisp everywhere at 0% idle and along the bottom/sides; ZERO ghost line slicing across the emerging bubble!)
    float liftOpen = smoothstep(0.001, 0.015, -sdBubble)
                   * smoothstep(uPillY + ph.y * 0.25, uPillY + ph.y * 0.72, p.y)
                   * uBubbleAlpha * ruptureMask;
    float vis = mix(0.96, 0.0, liftOpen);

    vec3 rimTint = mix(filmBounceCol, progIrid, max(progFill * 0.85, uSentFlash));
    rimTint = mix(rimTint, vec3(0.24, 0.74, 0.58), uSentState * 0.65);

    float wetness = max(0.22, max(progFill * 0.90, uOrbProg * 0.85 + uSentState * 0.75 + uSentFlash));
    vec4 rimG = evalGlassCapillary(sdPill, gPill, uWireR * 0.98, rimTint, wetness, vis);
    outCol = over(vec4(rimG.rgb * rimG.a, rimG.a), outCol);
  }

  // --- 6. TRUE 3D WEBGL2 DAUGHTER SOAP BUBBLES (POST-POP PINCH-OFF CLUSTER!) ---
  // Subtle airy shadow first for larger airborne daughter bubbles, then real thin-film 3D spheres
  for (int i = 0; i < MAX_DAUGHTERS; i++) {
    vec4 posR = uDPos[i];
    if (posR.z <= 0.001 || posR.w <= 0.002) continue;
    if (posR.z > 0.024) {
      vec2 ds = p - (posR.xy + vec2(0.012, -0.028));
      float rSh = posR.z * 1.45;
      if (dot(ds, ds) < rSh * rSh) {
        float sh = smoothstep(rSh, posR.z * 0.2, length(ds)) * 0.032 * posR.w * smoothstep(0.024, 0.065, posR.z);
        outCol = over(vec4(vec3(0.26, 0.28, 0.45) * sh, sh), outCol);
      }
    }
    vec4 db = evalDaughterBubble(p, posR, uDOpt[i], px);
    if (db.a > 0.001) outCol = over(db, outCol);
  }

  fragColor = outCol;
}
`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile error: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
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

class HoldToConfirmBubble {
  constructor(container, opts = {}) {
    this.width = opts.width || 640;
    this.height = opts.height || 360;
    this.aspect = this.width / this.height;
    this.dpr = opts.dpr || 2;
    this.labelIdle = opts.labelIdle || 'Hold to send';
    this.labelSent = opts.labelSent || 'Sent';
    this.holdDuration = opts.holdDuration || 1.85;
    this.audio = opts.audio || null;
    this.onConfirm = opts.onConfirm || (() => {});

    // Button anchored cleanly in lower-third so the giant soap bubble blooms HIGH ABOVE its top rim!
    this.pillHalfX = 0.50;
    this.pillHalfY = 0.155;
    this.pillY = -0.46;
    this.wireR = 0.0135;

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

    this.fxCanvas = document.createElement('canvas');
    this.fxCanvas.width = this.width * this.dpr;
    this.fxCanvas.height = this.height * this.dpr;
    this.fxCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    this.wrap.appendChild(this.fxCanvas);
    this.fxCtx = this.fxCanvas.getContext('2d');

    this._initGL();

    // 2D Navier-Stokes fluid grid
    this.nx = 64;
    this.ny = 64;
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

    this.time = 1.0;
    this.holding = false;
    this.progress = 0.0;
    this.orbProgress = 0.0;
    this.orbVel = 0.0;
    this.inflate = 1.0;
    this.inflateVel = 0.0;
    this.wob2 = 0.0;
    this.wob2Vel = 0.0;
    this.wob3 = 0.0;
    this.wob3Vel = 0.0;
    this.pressScale = 1.0;
    this.pressScaleVel = 0.0;

    this.sent = false;
    this.sentTime = 0.0;
    this.sentFlash = 0.0;
    this.ruptureActive = false;
    this.ruptureR = -1.0;
    this.rupturePos = { x: 0.16, y: 0.24 };
    this.bubbleAlpha = 1.0; // Living soap film is already stretched & wobbling across the button at rest!

    this.floatBubbles = [];
    this.pendingDaughters = [];
    this.droplets = [];
    this.popPuffs = [];
    this.popOrb = null;
    this.maxDaughters = 16;
    this.dPosBuf = new Float32Array(this.maxDaughters * 4);
    this.dOptBuf = new Float32Array(this.maxDaughters * 4);

    this._seedFilm();
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

    const names = [
      'uSim', 'uRes', 'uSize', 'uPillHalf', 'uPillY', 'uWireR', 'uTime',
      'uProgress', 'uOrbProg', 'uInflate', 'uBubbleAlpha', 'uOrbCenter', 'uOrbR',
      'uWobble', 'uTension', 'uPressScale', 'uSentFlash', 'uSentState',
      'uRuptureR', 'uRupturePos',
    ];
    this.u = {};
    for (const n of names) this.u[n] = gl.getUniformLocation(this.prog, n);
    this.u.uDPos = gl.getUniformLocation(this.prog, 'uDPos') || gl.getUniformLocation(this.prog, 'uDPos[0]');
    this.u.uDOpt = gl.getUniformLocation(this.prog, 'uDOpt') || gl.getUniformLocation(this.prog, 'uDOpt[0]');
  }

  pillCenterStagePos() {
    return {
      x: 0.5 * this.width,
      y: (0.5 - this.pillY * 0.5) * this.height,
    };
  }

  isInsidePillStage(sx, sy) {
    const lx = (sx / this.width * 2 - 1) * this.aspect;
    const ly = 1 - (sy / this.height * 2);
    return Math.abs(lx) <= this.pillHalfX + 0.08 && Math.abs(ly - this.pillY) <= this.pillHalfY + 0.08;
  }

  setHolding(down) {
    if (down && !this.holding) {
      if (this.sent) this.reset();
      this.holding = true;
      this.pressScaleVel -= 0.7;
      this.wob2Vel += 2.2;
      this.audio?.unlock();
    } else if (!down && this.holding) {
      this.holding = false;
      this.audio?.updateTension(0);
      if (!this.sent && this.progress > 0.05) {
        this.pressScaleVel += 0.9;
        this.wob2Vel -= 4.2 * this.progress;
        this.wob3Vel += 2.8 * this.progress;
        this._impulseZ(0, -0.2, -0.22, 0.35);
      }
    }
  }

  reset() {
    this.sent = false;
    this.sentTime = 0;
    this.sentFlash = 0;
    this.progress = 0;
    this.orbProgress = 0;
    this.orbVel = 0;
    this.ruptureActive = false;
    this.ruptureR = -1;
    this.bubbleAlpha = 1.0;
    this._seedFilm();
  }

  _orbGeom(p) {
    // At p=0: hidden inside pill. As p rises 0 -> 1: erupts directly UPWARD out of the top rim!
    const orbR = 0.08 + Math.pow(p, 0.76) * 0.53;
    const rise = Math.pow(p, 0.88) * 0.72;
    const swayX = Math.sin(this.time * 1.9) * 0.022 * Math.pow(p, 1.1);
    const swayY = Math.sin(this.time * 2.5) * 0.014 * p;
    return {
      cx: swayX,
      cy: this.pillY + rise + swayY,
      r: orbR,
    };
  }

  _triggerConfirmPop() {
    this.sent = true;
    this.holding = false;
    this.sentTime = 0;
    this.sentFlash = 1.0;
    this.pressScaleVel += 1.6;
    this.ruptureActive = true;
    this.ruptureR = 0.04;
    this.audio?.updateTension(0);
    this.audio?.playPop(1.35);

    const g = this._orbGeom(1.0);
    this.popOrb = { cx: g.cx, cy: g.cy, r: g.r };
    this.rupturePos = { x: g.cx + 0.16, y: g.cy + 0.22 };
    this.pendingDaughters = [];

    // Schedule 15 power-law sized 3D WebGL2 daughter soap bubbles across the giant orb & neck.
    // Each pinches off right as the retracting Culick rupture rim sweeps past its exact position!
    const count = 15;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.44;
      const frac = 0.28 + Math.random() * 0.68;
      const sx = g.cx + Math.cos(ang) * g.r * frac;
      const sy = g.cy + Math.sin(ang) * g.r * frac * 0.96;
      const dxR = sx - this.rupturePos.x;
      const dyR = sy - this.rupturePos.y;
      const distR = Math.hypot(dxR, dyR);
      const nxR = distR > 0.001 ? dxR / distR : Math.cos(ang);
      const nyR = distR > 0.001 ? dyR / distR : Math.sin(ang);

      // Power-law bubble size distribution in NDC (1.0 NDC = 180 CSS px):
      // ~3 medium (9-14px), ~5 small (5-9px), ~7 delicate micro-bubbles (2.4-4.8px)
      const u = Math.random();
      const rNdc = (i === 2 || i === 8 || u > 0.84) ? (0.050 + Math.random() * 0.026)
                 : u > 0.45 ? (0.028 + Math.random() * 0.022)
                 : (0.014 + Math.random() * 0.014);

      const outSpd = (0.36 + Math.random() * 0.72) * (0.72 + 0.028 / Math.max(0.018, rNdc));
      this.pendingDaughters.push({
        spawnAtR: Math.max(0.05, distR * 0.96),
        x: sx,
        y: sy,
        vx: (nxR * 0.58 + Math.cos(ang) * 0.42) * outSpd + (Math.random() - 0.5) * 0.18,
        vy: (nyR * 0.58 + Math.sin(ang) * 0.42) * outSpd + 0.08 + Math.random() * 0.14,
        r: rNdc,
        // Authentic thin-film base thickness (nm) matching real soap daughter films
        dNm: 185 + Math.random() * 440,
        // Strong pinch-off quadrupole oscillation that damps smoothly into a calm sphere
        wobAmp: 0.16 + Math.random() * 0.13,
        wobPhase: Math.random() * Math.PI * 2,
        wobFreq: 13.0 + Math.random() * 9.0,
        driftPhase: Math.random() * Math.PI * 2,
        driftAmp: 0.055 + Math.random() * 0.075,
        buoyancy: 0.04 + (0.045 / Math.max(0.02, rNdc)) * 0.055,
        drag: 3.1 + Math.random() * 1.3,
        age: 0,
        life: 1.0,
        decay: 0.25 + Math.random() * 0.34,
      });
    }

    // Immediate pinhole micro-spray right at the puncture origin
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 0.75 + Math.random() * 1.85;
      const isBead = Math.random() < 0.38;
      this.droplets.push({
        kind: isBead ? 'bead' : 'mist',
        x: this.rupturePos.x + Math.cos(a) * 0.02,
        y: this.rupturePos.y + Math.sin(a) * 0.02,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: isBead ? (1.4 + Math.random() * 1.4) : (0.6 + Math.random() * 0.8),
        drag: isBead ? (2.0 + Math.random() * 1.0) : (5.2 + Math.random() * 2.2),
        gravity: isBead ? (0.48 + Math.random() * 0.34) : (0.02 + Math.random() * 0.06),
        life: 1.0,
        decay: isBead ? (0.75 + Math.random() * 0.65) : (0.95 + Math.random() * 0.95),
        tint: 195 + Math.random() * 95,
        driftPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  _emitRimSpray(prevR, nextR) {
    if (!this.popOrb) return;
    const g = this.popOrb;
    const rp = this.rupturePos;

    // Pinch off daughter bubbles right as the tearing Culick rim sweeps past them
    for (let i = this.pendingDaughters.length - 1; i >= 0; i--) {
      const d = this.pendingDaughters[i];
      if (d.spawnAtR <= nextR) {
        if (this.floatBubbles.length >= this.maxDaughters) this.floatBubbles.shift();
        this.floatBubbles.push(d);
        this.pendingDaughters.splice(i, 1);
      }
    }

    // Shed Rayleigh-Plateau micro-droplets & fine aerosol mist along the active tearing rim arc!
    const midR = 0.5 * (prevR + nextR);
    if (midR > 1.38) return;
    const samples = 14;
    for (let s = 0; s < samples; s++) {
      const a = Math.random() * Math.PI * 2;
      const sx = rp.x + Math.cos(a) * midR;
      const sy = rp.y + Math.sin(a) * midR;
      const dOrb = Math.hypot(sx - g.cx, sy - g.cy);
      const inPillNeck = Math.abs(sx) < this.pillHalfX * 0.95 && sy > this.pillY - this.pillHalfY && sy < g.cy;
      if (dOrb > g.r * 1.04 && !inPillNeck) continue;

      const isBead = Math.random() < 0.34;
      // Tangent-plus-outward launch directly off the retracting beaded rim
      const ox = (sx - g.cx) / Math.max(0.08, dOrb);
      const oy = (sy - g.cy) / Math.max(0.08, dOrb);
      const spd = isBead ? (0.85 + Math.random() * 1.75) : (0.55 + Math.random() * 1.45);
      const dirX = Math.cos(a) * 0.65 + ox * 0.35 + (Math.random() - 0.5) * 0.32;
      const dirY = Math.sin(a) * 0.65 + oy * 0.35 + (Math.random() - 0.5) * 0.32;
      const dLen = Math.hypot(dirX, dirY) || 1;
      if (this.droplets.length > 155) this.droplets.shift();
      this.droplets.push({
        kind: isBead ? 'bead' : 'mist',
        x: sx,
        y: sy,
        vx: (dirX / dLen) * spd,
        vy: (dirY / dLen) * spd + (isBead ? 0.08 : 0.04),
        r: isBead ? (1.35 + Math.random() * 1.55) : (0.55 + Math.random() * 0.85),
        drag: isBead ? (1.85 + Math.random() * 1.05) : (4.8 + Math.random() * 2.5),
        gravity: isBead ? (0.48 + Math.random() * 0.38) : (0.01 + Math.random() * 0.06),
        life: 1.0,
        decay: isBead ? (0.68 + Math.random() * 0.62) : (0.82 + Math.random() * 0.88),
        tint: 185 + Math.random() * 120,
        driftPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  _seedFilm() {
    const { nx, ny } = this;
    const ph = 0.9;
    for (let j = 0; j < ny; j++) {
      const v = j / (ny - 1);
      for (let i = 0; i < nx; i++) {
        const u = i / (nx - 1);
        const idx = j * nx + i;
        const wave = 0.24 * Math.sin(u * 4.2 + ph) * Math.sin(v * Math.PI)
                   + 0.16 * Math.cos(u * 2.5 - v * 3.1 + ph * 0.7);
        this.thick[idx] = Math.max(0.08, Math.min(0.92, 0.20 + (1.0 - v) * 0.48 + wave));
        this.z[idx] = 0;
        this.zPrev[idx] = 0;
        this.shimmer[idx] = 0.08;
        this.vx[idx] = Math.sin(v * Math.PI * 2 + ph) * 0.65;
        this.vy[idx] = Math.cos(u * Math.PI * 2 - ph) * 0.50;
      }
    }
    this._injectVortex(-0.22, 0.18, 0.50, 3.2);
    this._injectVortex(0.24, -0.14, 0.46, -2.8);
    for (let s = 0; s < 14; s++) this._stepFluid(0.025);
  }

  _injectUpwardBlowJet(strength) {
    // Blows rainbow fluid directly UPWARD out of the button rim into the rising bubble!
    const { nx, ny, vx, vy, thick, shimmer } = this;
    const cx = (nx - 1) * 0.5;
    const cy = (ny - 1) * 0.24;
    for (let j = 2; j < ny - 2; j++) {
      const dy = (j - cy) / (ny * 0.24);
      for (let i = 2; i < nx - 2; i++) {
        const dx = (i - cx) / (nx * 0.22);
        const w = Math.exp(-(dx * dx * 1.6 + dy * dy * 1.4));
        if (w < 0.02) continue;
        const idx = j * nx + i;
        vy[idx] += strength * w;
        vx[idx] += Math.sin(this.time * 4.2 + dy * 2.0) * strength * 0.35 * w;
        const freshD = 0.30 + 0.32 * Math.sin(dx * 3.0 + this.time * 3.2);
        thick[idx] += (freshD - thick[idx]) * Math.min(0.18, w * 0.12);
        shimmer[idx] = Math.min(1, shimmer[idx] + w * 0.05);
      }
    }
  }

  _impulseZ(lx, ly, amp, radiusLocal) {
    const gx = (lx * 0.5 + 0.5) * (this.nx - 1);
    const gy = (ly * 0.5 + 0.5) * (this.ny - 1);
    const rx = radiusLocal * 0.5 * this.nx;
    const ry = radiusLocal * 0.5 * this.ny;
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

  _injectVortex(lx, ly, radiusLocal, strength) {
    const gx = (lx * 0.5 + 0.5) * (this.nx - 1);
    const gy = (ly * 0.5 + 0.5) * (this.ny - 1);
    const rx = radiusLocal * 0.5 * this.nx;
    const ry = radiusLocal * 0.5 * this.ny;
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
    const vortAmp = 1.9 * h;
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

    const damp = Math.exp(-1.05 * h);
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
    for (let iter = 0; iter < 6; iter++) {
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
    thick.set(thickTmp);
  }

  step(dt) {
    const h = Math.min(dt, 0.033);
    this.time += h;

    if (this.holding && !this.sent) {
      const rate = (1.0 / this.holdDuration) * (1.08 - 0.18 * this.progress);
      this.progress = Math.min(1.0, this.progress + h * rate);
      this.audio?.updateTension(this.progress);

      // Blow thin-film fluid UPWARD straight out of the button rim into the rising sphere!
      this._injectUpwardBlowJet((1.8 + this.progress * 3.0) * h * 18);
      const swirlSpd = 0.9 + this.progress * 2.2;
      this._injectVortex(Math.cos(this.time * swirlSpd) * 0.28, 0.22, 0.44, (0.8 + this.progress * 1.6) * h * 16);
      if (this.progress > 0.68) {
        this._impulseZ(Math.cos(this.time * 9.0) * 0.22, 0.22, 0.03 * this.progress, 0.22);
      }

      if (this.progress >= 1.0) {
        this._triggerConfirmPop();
        this.onConfirm();
      }
    } else if (!this.sent) {
      this.progress = Math.max(0.0, this.progress - h * 2.4);
      // Gentle living ambient fluid shimmer & capillary wobble on the default idle soap film!
      const sw = this.time * 0.9;
      this._injectVortex(Math.cos(sw) * 0.28, Math.sin(sw * 0.8) * 0.18, 0.42, 0.35 * h * 16);
      if (Math.sin(this.time * 2.4) > 0.85) {
        this._impulseZ(Math.cos(this.time * 1.7) * 0.26, Math.sin(this.time * 2.1) * 0.10, 0.012, 0.26);
      }
    }

    if (this.sent) {
      this.sentTime += h;
      this.sentFlash *= Math.exp(-3.2 * h);
    }

    if (this.ruptureActive) {
      const prevR = this.ruptureR;
      this.ruptureR += h * 6.0;
      this._emitRimSpray(prevR, this.ruptureR);
      if (this.ruptureR > 1.95) {
        this.ruptureActive = false;
        this.ruptureR = -1.0;
        this.bubbleAlpha = 0.0;
        this.pendingDaughters.length = 0;
      }
    } else if (!this.sent) {
      this.bubbleAlpha += (1.0 - this.bubbleAlpha) * Math.min(1, h * 14.0);
    }

    const targetOrb = this.sent ? (this.ruptureActive ? 1.04 : 0.0) : this.progress;
    this.orbVel += ((targetOrb - this.orbProgress) * 76 - this.orbVel * 7.6) * h;
    this.orbProgress = Math.max(0.0, Math.min(1.15, this.orbProgress + this.orbVel * h));

    const targetPS = this.holding ? 0.968 : 1.0;
    this.pressScaleVel += ((targetPS - this.pressScale) * 210 - this.pressScaleVel * 14.0) * h;
    this.pressScale += this.pressScaleVel * h;

    const targetInflate = 1.0 + 0.06 * Math.sin(this.time * 2.6);
    this.inflateVel += ((targetInflate - this.inflate) * 85 - this.inflateVel * 7.2) * h;
    this.inflate += this.inflateVel * h;

    const wobDrive = this.holding
      ? Math.sin(this.time * (3.6 + this.progress * 5.0)) * (0.26 + 0.52 * this.progress)
      : Math.sin(this.time * 2.5) * 0.16;
    this.wob2Vel += ((wobDrive - this.wob2) * 58 - this.wob2Vel * 4.6) * h;
    this.wob2 += this.wob2Vel * h;
    this.wob3Vel += ((-wobDrive * 0.7 - this.wob3) * 84 - this.wob3Vel * 5.6) * h;
    this.wob3 += this.wob3Vel * h;

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

    // True 3D daughter soap bubbles: realistic hollow-film air drag + gentle indoor eddy currents + damped pinch-off wobble!
    for (let i = this.floatBubbles.length - 1; i >= 0; i--) {
      const b = this.floatBubbles[i];
      b.age += h;
      const dragF = Math.exp(-b.drag * h);
      b.vx *= dragF;
      b.vy *= dragF;
      b.vy += b.buoyancy * h;
      const eddyX = Math.sin(this.time * 1.45 + b.driftPhase) * b.driftAmp;
      const eddyY = Math.cos(this.time * 1.15 - b.driftPhase * 0.7) * b.driftAmp * 0.45;
      b.x += (b.vx + eddyX) * h;
      b.y += (b.vy + eddyY) * h;
      b.wobPhase += b.wobFreq * h;
      b.wobAmp *= Math.exp(-3.6 * h);
      // Slight film thinning via drainage & evaporation over lifetime
      b.dNm = Math.max(95, b.dNm - 24.0 * h);
      b.life -= b.decay * h;
      if (b.life <= 0) {
        // Real micro-bubble rupture: ultra-delicate evaporating mist halo + 6 microscopic aerosol specks (NO cartoon stars!)
        this.popPuffs.push({
          x: b.x,
          y: b.y,
          r: b.r * 0.92,
          rTarget: b.r * 1.65,
          life: 1.0,
          decay: 4.4,
        });
        for (let k = 0; k < 6; k++) {
          const ka = (k / 6) * Math.PI * 2 + Math.random() * 0.7;
          const kSpd = 0.25 + Math.random() * 0.55;
          if (this.droplets.length > 155) this.droplets.shift();
          this.droplets.push({
            kind: 'mist',
            x: b.x + Math.cos(ka) * b.r * 0.75,
            y: b.y + Math.sin(ka) * b.r * 0.75,
            vx: Math.cos(ka) * kSpd,
            vy: Math.sin(ka) * kSpd,
            r: 0.55 + Math.random() * 0.65,
            drag: 6.4 + Math.random() * 1.8,
            gravity: 0.04,
            life: 0.85,
            decay: 2.2 + Math.random() * 1.2,
            tint: 210 + Math.random() * 60,
            driftPhase: Math.random() * Math.PI * 2,
          });
        }
        this.floatBubbles.splice(i, 1);
      }
    }

    // Rayleigh-Plateau water droplets & suspended aerosol mist: Stokes drag + real gravity arc on beads!
    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const d = this.droplets[i];
      const df = Math.exp(-d.drag * h);
      d.vx *= df;
      d.vy = d.vy * df - d.gravity * h;
      const turb = d.kind === 'mist' ? Math.sin(this.time * 2.1 + d.driftPhase) * 0.045 : 0;
      d.x += (d.vx + turb) * h;
      d.y += d.vy * h;
      d.life -= d.decay * h;
      if (d.life <= 0) this.droplets.splice(i, 1);
    }

    for (let i = this.popPuffs.length - 1; i >= 0; i--) {
      const pf = this.popPuffs[i];
      pf.life -= pf.decay * h;
      pf.r += (pf.rTarget - pf.r) * Math.min(1, h * 9.5);
      if (pf.life <= 0) this.popPuffs.splice(i, 1);
    }
  }

  _drawUnderLabel() {
    const ctx = this.underCtx;
    const w = this.underCanvas.width;
    const h = this.underCanvas.height;
    const dpr = this.dpr;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = (0.5 - this.pillY * 0.5) * h;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this.pressScale, this.pressScale);

    if (!this.sent) {
      const pct = Math.min(99, Math.round(this.progress * 100));
      const text = this.progress > 0.04 ? `${this.labelIdle} · ${pct}%` : this.labelIdle;
      ctx.font = `600 ${14.5 * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      // shrink the label to fit the pill when the control is drawn small
      const fit = Math.min(1, (this.pillHalfX * h * 0.84) / Math.max(1, ctx.measureText(text).width));
      if (fit < 1) ctx.font = `600 ${14.5 * dpr * fit}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(26, 28, 44, ${0.88 - 0.14 * this.progress})`;
      ctx.fillText(text, 0, 0.5 * dpr);
    } else {
      const tIn = Math.min(1, this.sentTime / 0.24);
      const popScale = 0.85 + 0.15 * (1 - Math.pow(1 - tIn, 3));
      ctx.scale(popScale, popScale);
      ctx.font = `600 ${15 * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      let tw = ctx.measureText(this.labelSent).width;
      const sFit = Math.min(1, (this.pillHalfX * h * 0.84) / Math.max(1, tw + 23 * dpr));
      if (sFit < 1) { ctx.scale(sFit, sFit); }
      const iconW = 16 * dpr;
      const gap = 7 * dpr;
      const startX = -(iconW + gap + tw) * 0.5;

      ctx.strokeStyle = '#18795E';
      ctx.lineWidth = 2.2 * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const p1 = Math.min(1, tIn * 2.2);
      const p2 = Math.max(0, Math.min(1, (tIn - 0.35) / 0.65));
      const x0 = startX + 1 * dpr, y0 = 0.5 * dpr;
      const x1 = startX + 6 * dpr, y1 = 5.2 * dpr;
      const x2 = startX + 14.5 * dpr, y2 = -4.8 * dpr;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + (x1 - x0) * p1, y0 + (y1 - y0) * p1);
      if (p2 > 0) ctx.lineTo(x1 + (x2 - x1) * p2, y1 + (y2 - y1) * p2);
      ctx.stroke();

      ctx.fillStyle = '#155E4B';
      ctx.fillText(this.labelSent, startX + iconW + gap, 0.5 * dpr);
    }

    ctx.restore();
  }

  _drawWaterDroplet(ctx, px, py, rPx, vx, vy, alpha, tintHue, kind) {
    if (rPx < 0.45 || alpha <= 0.015) return;
    const spd = Math.hypot(vx, vy);
    const stretch = kind === 'bead' ? Math.min(2.35, 1.0 + Math.max(0, spd - 0.35) * 0.58) : Math.min(1.75, 1.0 + Math.max(0, spd - 0.55) * 0.42);
    const ang = spd > 0.04 ? Math.atan2(-vy, vx) : 0;

    ctx.save();
    ctx.translate(px, py);
    if (stretch > 1.04) ctx.rotate(ang);
    ctx.scale(stretch, 1 / Math.sqrt(stretch));

    if (kind === 'mist' || rPx < 2.2) {
      // Microscopic translucent aerosol mist droplet on white: crisp refractive cool-glass rim + white caustic core
      ctx.fillStyle = `rgba(104, 122, 168, ${alpha * 0.30})`;
      ctx.beginPath();
      ctx.arc(rPx * 0.15, rPx * 0.16, rPx * 1.02, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.92})`;
      ctx.beginPath();
      ctx.arc(-rPx * 0.14, -rPx * 0.16, rPx * 0.64, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Refractive Rayleigh-Plateau clear water bead: glistening crystal lens + whisper-soft refractive rim + sharp pinpoint glint
      const grad = ctx.createRadialGradient(-rPx * 0.26, -rPx * 0.26, rPx * 0.10, 0, 0, rPx);
      grad.addColorStop(0.0, `rgba(255, 255, 255, ${alpha * 0.96})`);
      grad.addColorStop(0.50, `rgba(246, 250, 255, ${alpha * 0.30})`);
      grad.addColorStop(0.80, `hsla(${tintHue}, 44%, 68%, ${alpha * 0.30})`);
      grad.addColorStop(0.95, `rgba(92, 108, 158, ${alpha * 0.40})`);
      grad.addColorStop(1.0, `rgba(255, 255, 255, ${alpha * 0.72})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rPx, 0, Math.PI * 2);
      ctx.fill();

      // Delicate bottom-right refractive water meniscus crescent
      ctx.strokeStyle = `rgba(88, 104, 152, ${alpha * 0.32})`;
      ctx.lineWidth = Math.max(0.6, rPx * 0.14);
      ctx.beginPath();
      ctx.arc(0, 0, rPx * 0.90, 0.08 * Math.PI, 0.72 * Math.PI);
      ctx.stroke();

      // Razor-sharp top-left studio light pinpoint
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.98})`;
      ctx.beginPath();
      ctx.arc(-rPx * 0.30, -rPx * 0.30, Math.max(0.65, rPx * 0.32), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  render() {
    this._drawUnderLabel();

    const { gl, u } = this;
    gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.nx, this.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.texData);

    const p = this.orbProgress;
    const g = this._orbGeom(p);
    const tension = Math.max(0, (this.progress - 0.68) / 0.32);

    gl.uniform1i(u.uSim, 0);
    gl.uniform2f(u.uRes, this.glCanvas.width, this.glCanvas.height);
    gl.uniform2f(u.uSize, this.width, this.height);
    gl.uniform2f(u.uPillHalf, this.pillHalfX, this.pillHalfY);
    gl.uniform1f(u.uPillY, this.pillY);
    gl.uniform1f(u.uWireR, this.wireR);
    gl.uniform1f(u.uTime, this.time);

    gl.uniform1f(u.uProgress, this.sent ? 0.0 : this.progress);
    gl.uniform1f(u.uOrbProg, p);
    gl.uniform1f(u.uInflate, Math.max(0.1, this.inflate));
    gl.uniform1f(u.uBubbleAlpha, this.bubbleAlpha);
    gl.uniform2f(u.uOrbCenter, g.cx, g.cy);
    gl.uniform1f(u.uOrbR, g.r);
    gl.uniform2f(u.uWobble, this.wob2, this.wob3);
    gl.uniform1f(u.uTension, this.sent ? 0.0 : tension);
    gl.uniform1f(u.uPressScale, this.pressScale);
    gl.uniform1f(u.uSentFlash, this.sentFlash);
    gl.uniform1f(u.uSentState, this.sent ? 1.0 : 0.0);

    gl.uniform1f(u.uRuptureR, this.ruptureActive ? this.ruptureR : -1.0);
    gl.uniform2f(u.uRupturePos, this.rupturePos.x, this.rupturePos.y);

    // Upload true 3D WebGL2 daughter soap bubbles (sorted small-to-large for clean optical layering)
    this.dPosBuf.fill(0);
    this.dOptBuf.fill(0);
    const nD = Math.min(this.maxDaughters, this.floatBubbles.length);
    for (let i = 0; i < nD; i++) {
      const b = this.floatBubbles[i];
      const birthScale = Math.min(1.0, b.age / 0.055);
      const fadeA = Math.min(1.0, b.life * 3.8) * birthScale;
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
    if (u.uDPos) gl.uniform4fv(u.uDPos, this.dPosBuf);
    if (u.uDOpt) gl.uniform4fv(u.uDOpt, this.dOptBuf);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Photorealistic Rayleigh-Plateau water droplets, fine aerosol mist & micro-vapor pop puffs
    const ctx = this.fxCtx;
    const dpr = this.dpr;
    const w = this.fxCanvas.width;
    const h = this.fxCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const toPx = (lx, ly) => [
      ((lx / this.aspect) * 0.5 + 0.5) * w,
      (0.5 - ly * 0.5) * h,
    ];

    for (const pf of this.popPuffs) {
      const [px, py] = toPx(pf.x, pf.y);
      const rPx = pf.r * 0.5 * h;
      const a = Math.max(0, pf.life) * 0.24;
      ctx.save();
      ctx.strokeStyle = `rgba(116, 130, 174, ${a})`;
      ctx.lineWidth = Math.max(0.6, 0.75 * dpr * pf.life);
      ctx.setLineDash([1.5 * dpr, 3.2 * dpr]);
      ctx.beginPath();
      ctx.arc(px, py, rPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const d of this.droplets) {
      const [px, py] = toPx(d.x, d.y);
      const a = Math.min(1, d.life * 1.55);
      // Slight evaporation shrink near the end of droplet life
      const evap = 0.58 + 0.42 * Math.min(1, d.life * 1.4);
      this._drawWaterDroplet(ctx, px, py, d.r * dpr * evap, d.vx, d.vy, a, d.tint, d.kind);
    }
  }
}
