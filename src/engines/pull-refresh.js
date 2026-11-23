// ============================================================================
// PULL TO REFRESH — FULL-WIDTH RECTANGULAR SOAP FILM ENGINE
// ============================================================================
// Pulling the feed downward stretches a living 3D iridescent soap membrane
// matching the exact rectangular shape of the opening from the very first pixel
// (pinned flush between the header hairline, sliding feed edge, and card walls).
// - Release early (< threshold): the opening glides shut, compressing the
//   rectangular soap film cleanly back into the hairline with a wet shimmer wave.
// - Release past threshold: locks open to refresh; the rectangular soap pillow
//   swirls with live 2D Navier-Stokes Marangoni currents and swells with rising
//   3D pressure until a high-speed Rayleigh-Plateau Culick rupture rips across
//   the entire rectangle into 3D WebGL2 daughter bubbles + fine water mist as
//   the frame glides smoothly shut onto the new feed item.

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
uniform float uTime;

// Card & opening rectangle geometry in NDC (x in [-aspect, aspect], y in [-1, 1], +y up)
uniform float uSeamY;
uniform float uCardHalfX;
uniform float uListTopY;
uniform float uBubbleAlpha;  // 0..1 membrane visibility
uniform float uPull;         // 0..1.2 stretch progress
uniform float uStretchBow;   // subtle elastic inward waist curve during fast active pull
uniform float uDragShiftX;   // subtle lateral fluid bias when cursor sways horizontally
uniform float uRefreshProg;  // 0..1 refresh charge & pressure swell
uniform float uSpinEnergy;   // 0..1 Marangoni vortex energy during refresh
uniform float uTension;      // 0..1 mounting pre-pop tension shimmer
uniform float uInflate;      // 3D dome inflation puffiness

// Hairline wet capillary wave after retract or pop
uniform float uSeamWave;
uniform float uSeamWaveR;

// Culick rupture hole sweeping across the rectangular soap film on pop
uniform float uRuptureR;
uniform vec2 uRupturePos;

// True 3D WebGL2 daughter soap bubbles (post-pop cluster)
#define MAX_DAUGHTERS 16
uniform int uDaughterCount;
uniform vec4 uDPos[MAX_DAUGHTERS]; // (x, y, radius, alpha)
uniform vec4 uDOpt[MAX_DAUGHTERS]; // (dNm, wobAmp, wobPhase, age)

float sdRoundedBox(vec2 p, vec2 b, float r) {
  float rr = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + vec2(rr);
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rr;
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

  vec3 L1 = normalize(vec3(-0.52, 0.78, 0.50));
  vec3 H1 = normalize(L1 + V);
  float ndh1 = max(0.0, dot(N, H1));
  float arc1 = smoothstep(0.84, 0.94, ndh1) * 0.78 + smoothstep(0.955, 0.990, ndh1) * 0.98;

  vec3 L2 = normalize(vec3(0.66, -0.58, 0.44));
  vec3 H2 = normalize(L2 + V);
  float ndh2 = max(0.0, dot(N, H2));
  float arc2 = smoothstep(0.88, 0.96, ndh2) * 0.52;

  float skyArc = smoothstep(0.18, 0.90, -pNorm.x * 0.35 + pNorm.y * 0.90) * smoothstep(0.16, 0.80, 1.0 - NdotV) * 0.26;

  // Crisp optical diamond starburst glint on upper-left pillow shoulder
  vec2 starCenter = vec2(-0.58, 0.52);
  vec2 dStar = (pNorm - starCenter) * vec2(5.2, 2.8);
  float rStar = length(dStar);
  float rayH = exp(-abs(dStar.y) * 24.0) * exp(-abs(dStar.x) * 3.8);
  float rayV = exp(-abs(dStar.x) * 24.0) * exp(-abs(dStar.y) * 3.8);
  vec2 dDiag = vec2(dStar.x + dStar.y, dStar.x - dStar.y) * 0.7071;
  float rayD = (exp(-abs(dDiag.y) * 32.0) * exp(-abs(dDiag.x) * 6.8)
              + exp(-abs(dDiag.x) * 32.0) * exp(-abs(dDiag.y) * 6.8)) * 0.50;
  float coreDot = exp(-rStar * rStar * 20.0);
  float twinkle = 0.82 + 0.18 * sin(time * (4.6 + starBoost * 5.0) + pNorm.x * 2.0);
  float starburst = (coreDot * 0.98 + (rayH + rayV + rayD) * smoothstep(0.85, 0.0, rStar) * 0.88)
                  * twinkle * smoothstep(0.32, 0.78, ndh1 + 0.22) * starBoost;

  return vec3(clamp(arc1 + arc2 + skyArc + starburst, 0.0, 1.55), skyArc, starburst);
}

vec4 over(vec4 src, vec4 dst) {
  return vec4(src.rgb + dst.rgb * (1.0 - src.a), src.a + dst.a * (1.0 - src.a));
}

// Photorealistic 3D WebGL2 daughter soap bubble (post-pop cluster)
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
  float rEff = max(0.0025, r * (1.0 + wob));
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

// Rectangular soap film matching the exact opening between uSeamY and uListTopY
float sdRectBubble(vec2 p, vec2 rectCenter, vec2 rectHalf, float cornerR) {
  vec2 bp = p - rectCenter;
  float hySafe = max(0.005, rectHalf.y);
  // Subtle minimal-surface elastic inward curve along the side walls during rapid pull stretch
  float yn = clamp(bp.y / hySafe, -1.0, 1.0);
  float midBand = 1.0 - yn * yn;
  vec2 bEff = vec2(max(0.04, rectHalf.x - uStretchBow * midBand), rectHalf.y);
  // Microscopic high-frequency pre-pop capillary shiver right before rupture
  float tremor = uTension * 0.0022 * sin(bp.x * 26.0 + uTime * 30.0) * midBand;
  return sdRoundedBox(bp, bEff, cornerR) - tremor;
}

void main() {
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2((vUv.x * 2.0 - 1.0) * aspect, (vUv.y * 2.0 - 1.0));
  float px = 2.0 / uSize.y;

  vec4 outCol = vec4(0.0);

  // Exact rectangular opening geometry (strictly flush inside the Inbox card!)
  float gapH = max(0.0, uSeamY - uListTopY);
  vec2 rectCenter = vec2(0.0, 0.5 * (uSeamY + uListTopY));
  vec2 rectHalf = vec2(uCardHalfX - 0.007, max(0.002, gapH * 0.5 - 0.004));
  float cornerR = min(0.026, min(rectHalf.x, rectHalf.y));

  // Fast bounding-box check around the rectangular opening so pure-white margins skip SDF work!
  bool inHeroBox = (uBubbleAlpha > 0.005)
    && (gapH > 0.004)
    && (abs(p.x) < uCardHalfX + 0.04)
    && (p.y < uSeamY + 0.03)
    && (p.y > uListTopY - 0.08);

  if (inHeroBox) {
    float sdBubble = sdRectBubble(p, rectCenter, rectHalf, cornerR);

    // --- 1. SUBTLE SOFT AMBIENT SHADOW INSIDE THE OPENING ---
    {
      vec2 pSh = p + vec2(-0.010, 0.022);
      float sdSh = sdRectBubble(pSh, rectCenter, rectHalf, cornerR);
      float insideOpening = smoothstep(uSeamY + 0.004, uSeamY - 0.012, p.y)
                          * smoothstep(uListTopY - 0.025, uListTopY + 0.006, p.y)
                          * smoothstep(uCardHalfX + 0.006, uCardHalfX - 0.012, abs(p.x));
      float bSh = smoothstep(0.055, -0.015, sdSh) * 0.036 * uBubbleAlpha * insideOpening;
      outCol = over(vec4(vec3(0.24, 0.25, 0.44) * bSh, bSh), outCol);
    }

    // --- 2. CULICK RUPTURE HOLE SWEEPING ACROSS THE RECTANGULAR SOAP FILM ---
    float ruptureMask = 1.0;
    float ruptureRim = 0.0;
    if (uRuptureR > 0.001) {
      vec2 dp = p - uRupturePos;
      float ang = atan(dp.y, dp.x);
      float rimBeads = (vnoise(vec2(ang * 13.0, uRuptureR * 6.5)) - 0.5) * 0.048
                     + (vnoise(vec2(ang * 28.0, uRuptureR * 14.0)) - 0.5) * 0.020
                     + sin(ang * 36.0 + uRuptureR * 20.0) * 0.007;
      float dHole = length(dp) - (uRuptureR + rimBeads);
      ruptureMask = smoothstep(-px * 2.4, px * 2.4, dHole);
      float beadPulse = 0.78 + 0.36 * sin(ang * 36.0 + uRuptureR * 20.0);
      ruptureRim = exp(-abs(dHole) * 44.0) * smoothstep(-0.015, 0.024, dHole + 0.010) * beadPulse;
    }

    // --- 3. 3D VOLUMETRIC RECTANGULAR SOAP PILLOW (EXACT SHAPE OF OPENING!) ---
    float orbMask = smoothstep(px * 1.65, -px * 1.65, sdBubble) * uBubbleAlpha * ruptureMask;

    if (orbMask > 0.001) {
      float eps = 0.003;
      vec2 gRim = normalize(vec2(
        sdRectBubble(p + vec2(eps, 0.0), rectCenter, rectHalf, cornerR) - sdRectBubble(p - vec2(eps, 0.0), rectCenter, rectHalf, cornerR),
        sdRectBubble(p + vec2(0.0, eps), rectCenter, rectHalf, cornerR) - sdRectBubble(p - vec2(0.0, eps), rectCenter, rectHalf, cornerR)
      ) + 1e-5);

      float dIn = max(0.0, -sdBubble);
      float scaleSafe = max(0.007, min(rectHalf.x, rectHalf.y));
      float rho = clamp(1.0 - dIn / scaleSafe, 0.0, 0.998);

      // C-infinity crease-free minimal-surface soap-pillow dome normal!
      // Works seamlessly from a razor-thin 4px slit all the way to the full 115px rectangular window!
      vec2 pNorm = (p - rectCenter) / max(rectHalf, vec2(0.008));
      vec2 aBox = clamp(abs(pNorm), vec2(1e-4), vec2(0.998));
      float openF = smoothstep(0.025, 0.22, rectHalf.y);
      float pxPow = mix(7.2, 5.2, openF);
      float pyPow = mix(2.0, 3.0, openF);
      float wx = max(0.0, 1.0 - pow(aBox.x, pxPow));
      float wy = max(0.0, 1.0 - pow(aBox.y, pyPow));
      vec2 pillowGrad = vec2(
        sign(pNorm.x) * pxPow * pow(aBox.x, pxPow - 1.0) * (wy + 0.14),
        sign(pNorm.y) * pyPow * pow(aBox.y, pyPow - 1.0) * (wx + 0.14)
      );
      vec2 pillowDir = normalize(pillowGrad + 1e-5);
      float pillowSlope = clamp(1.0 - wx * wy, 0.0, 0.996);

      // Only blend exact rounded-box gRim along the outermost razor rim -> ZERO 45-deg corner bevel crease!
      vec2 domeDir = normalize(mix(pillowDir, gRim, smoothstep(0.84, 0.98, rho)) + 1e-5);

      // Sample live 2D Navier-Stokes Marangoni currents mapped cleanly across the rectangular opening
      vec2 simSpan = vec2(max(0.55, rectHalf.x * 2.10), max(0.32, rectHalf.y * 2.20));
      vec2 simUv = clamp(((p - rectCenter - vec2(uDragShiftX * 0.25, 0.0)) / simSpan) + 0.5, 0.004, 0.996);
      vec2 texel = 1.0 / vec2(textureSize(uSim, 0));
      vec4 simC = texture(uSim, simUv);
      float zL = texture(uSim, simUv - vec2(texel.x, 0.0)).g;
      float zR = texture(uSim, simUv + vec2(texel.x, 0.0)).g;
      float zD = texture(uSim, simUv - vec2(0.0, texel.y)).g;
      float zU = texture(uSim, simUv + vec2(0.0, texel.y)).g;
      vec2 gradZ = vec2(zR - zL, zU - zD) * 5.8;

      // Living Marangoni capillary wave tilt across the stretched sheet
      vec2 spinTilt = (0.032 + uSpinEnergy * 0.068) * vec2(
        sin(pNorm.y * 3.4 + pNorm.x * 2.4 + uTime * (2.6 + 2.0 * uSpinEnergy)),
        cos(pNorm.x * 3.6 - pNorm.y * 2.2 - uTime * (2.4 + 1.8 * uSpinEnergy))
      ) * openF;

      float domeRadius = mix(pillowSlope, rho, smoothstep(0.76, 0.96, rho));
      float puffPow = mix(1.06, 1.32, openF);
      float rimSteep = pow(clamp(domeRadius, 1e-4, 0.995), puffPow) * (0.84 + 0.16 * uInflate);

      // Wet meniscus fillets along top header hairline & bottom sliding-feed edge
      float topTouch = exp(-abs(p.y - uSeamY) * 58.0);
      float botTouch = exp(-abs(p.y - uListTopY) * 58.0);
      float seamContact = max(topTouch, botTouch);
      vec2 nXY = domeDir * rimSteep + vec2(0.0, 0.17 * topTouch - 0.16 * botTouch) + spinTilt - gradZ;
      if (ruptureRim > 0.02) {
        nXY -= normalize(p - uRupturePos + 1e-5) * ruptureRim * 1.25;
      }

      float nXY2 = dot(nXY, nXY);
      vec3 N = normalize(vec3(nXY, sqrt(max(0.06, 1.0 - min(0.94, nXY2)))));
      vec3 V = vec3(0.0, 0.0, 1.0);
      float NdotV = clamp(dot(N, V), 0.06, 1.0);
      float slopeMag = length(gradZ);

      float fres = pow(max(1e-4, 1.0 - NdotV), 2.20);
      float razorRim = pow(max(1e-4, 1.0 - NdotV), 4.7);

      // Resolution-adaptive crisp optical rim contour along all 4 walls & rounded corners
      float rimOff = max(0.048, min(0.24, px * 1.25 / scaleSafe));
      float normDepth = clamp(dIn / scaleSafe, 0.0, 1.0);
      float ioArg = (normDepth - rimOff) / max(0.036, rimOff * 0.68);
      float innerOutline = exp(-(ioArg * ioArg));
      float hairOff = min(0.052, px * 0.52 / scaleSafe);
      float owArg = (normDepth - hairOff) / max(0.022, px * 0.55 / scaleSafe);
      float outerWhiteHair = exp(-(owArg * owArg));

      // Singularity-free Marangoni thin-film interference ribbons flowing across the rectangular film!
      float rectWave = (0.36 + 0.34 * uSpinEnergy) * sin(pNorm.x * 3.1 - pNorm.y * 2.1 - uTime * (1.8 + 3.2 * uSpinEnergy) + simC.r * 2.8)
                     + (0.18 + 0.20 * uSpinEnergy) * cos(pNorm.x * 5.0 + pNorm.y * 2.9 + uTime * (1.4 + 2.4 * uSpinEnergy));
      float flowWave = 0.5 + 0.5 * sin(pNorm.x * 2.0 - pNorm.y * 1.6 + simC.r * 3.3 + uTime * (0.9 + 2.2 * uTension + 2.2 * uSpinEnergy) + rectWave * 2.2);
      float dNmBase = mix(130.0, 745.0, simC.r * 0.65 + flowWave * 0.35);
      float dNm = mix(dNmBase, 160.0 + 230.0 * flowWave, max(uTension * 0.52, uSpinEnergy * 0.44))
                + fres * 240.0 + seamContact * 125.0;

      float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
      float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
      vec3 irid = bubbleIridescence(dNm, cosTheta);

      float starBoost = (0.24 + 0.50 * clamp(uPull, 0.0, 1.0) + 0.55 * uRefreshProg + 0.55 * uTension) * openF;
      vec3 specInfo = bubbleSpeculars(N, NdotV, pNorm, uTime, starBoost);
      float specArc = specInfo.x;

      // Micro caustic sparkle dust intensifying as the film charges toward pop
      vec2 spGrid = (p + vec2(simC.r * 0.32, -simC.g * 0.25)) * 22.0;
      vec2 spCell = floor(spGrid);
      vec2 spF = fract(spGrid) - 0.5;
      float spRnd = hash21(spCell);
      float spDot = smoothstep(0.16, 0.02, length(spF)) * step(0.935 - (uTension + uSpinEnergy * 0.7) * 0.030, spRnd)
                  * (0.45 + 0.55 * sin(uTime * (5.5 + uTension * 6.0) + spRnd * 40.0))
                  * (0.35 + 0.65 * fres + simC.b + uTension * 0.50 + uSpinEnergy * 0.35);

      float ribbon = (0.18 + 0.58 * uSpinEnergy + 0.24 * uPull)
                   * (0.5 + 0.5 * sin(pNorm.x * 3.0 - pNorm.y * 2.2 - uTime * (2.2 + 3.4 * uSpinEnergy) + simC.r * 2.6))
                   * smoothstep(0.05, 0.68, rho + 0.24) * openF;

      vec3 contourCol = mix(vec3(0.35, 0.39, 0.67), irid * 0.65 + vec3(0.18, 0.16, 0.36), 0.54);
      vec3 domeColor = mix(vec3(0.93, 0.96, 1.0), irid * 0.93 + vec3(0.16, 0.19, 0.27), 0.88);

      vec3 col = mix(vec3(0.96, 0.97, 1.0), domeColor, clamp(0.18 + fres * 0.78 + seamContact * 0.32 + slopeMag * 0.42 + uTension * 0.18 + ribbon * 0.50, 0.0, 1.0));
      col = mix(col, contourCol, clamp(innerOutline * 0.58 + razorRim * 0.46, 0.0, 0.82));
      float crescentBand = smoothstep(0.08, 0.76, max(max(fres, ribbon * 0.68), seamContact * 0.60)) * (1.0 - outerWhiteHair * 0.62);
      col = mix(col, clamp(irid * 1.14 + vec3(0.09, 0.07, 0.13), 0.0, 1.0), crescentBand * 0.68);

      float whiteGlow = clamp(specArc * 0.96 + outerWhiteHair * 0.86 + seamContact * 0.38 + spDot * 0.92 + ruptureRim * 1.05, 0.0, 0.99);
      col = mix(col, vec3(1.0, 0.998, 1.0), whiteGlow);

      float alpha = clamp(
        0.095 + fres * 0.78 + innerOutline * 0.54 + outerWhiteHair * 0.76 + specArc * 0.88
        + seamContact * 0.32 + ribbon * 0.25 + slopeMag * 0.28 + ruptureRim * 0.96,
        0.0, 0.97
      );
      outCol = over(vec4(col * (alpha * orbMask), alpha * orbMask), outCol);
    }
  }

  // --- 4. WET IRIDESCENT MENISCUS SHIMMER ALONG THE PINNED HEADER HAIRLINE ---
  float dSeam = abs(p.y - uSeamY);
  if (dSeam < px * 5.0 && abs(p.x) < uCardHalfX) {
    float inCardX = smoothstep(uCardHalfX - 0.01, uCardHalfX - 0.12, abs(p.x));
    float sbArg = dSeam / (px * 1.65);
    float seamBand = exp(-(sbArg * sbArg)) * inCardX;
    if (seamBand > 0.005) {
      float dxA = abs(p.x);
      float rArg = dxA / 0.30;
      float restGlow = exp(-(rArg * rArg)) * (0.28 + 0.08 * sin(uTime * 2.4));
      float pullGlow = clamp(uPull * 1.5, 0.0, 1.0) * 0.62;
      float wArg = (dxA - uSeamWaveR) / 0.11;
      float waveRing = exp(-(wArg * wArg)) * uSeamWave * 1.05;
      float wtArg = dxA / max(0.08, uSeamWaveR + 0.06);
      float waveTrail = exp(-(wtArg * wtArg)) * uSeamWave * 0.42;

      float intensity = clamp(restGlow + pullGlow + waveRing + waveTrail, 0.0, 1.0);
      vec3 seamIrid = bubbleIridescence(220.0 + p.x * 320.0 + uTime * 95.0, 0.82);
      vec3 sCol = mix(vec3(0.70, 0.76, 0.92), seamIrid * 1.08 + vec3(0.10), 0.78);
      float sAlpha = seamBand * intensity * 0.82;
      outCol = over(vec4(sCol * sAlpha, sAlpha), outCol);
    }
  }

  // --- 5. TRUE 3D WEBGL2 DAUGHTER SOAP BUBBLES (POST-POP CLUSTER!) ---
  for (int i = 0; i < MAX_DAUGHTERS; i++) {
    if (i >= uDaughterCount) break;
    vec4 posR = uDPos[i];
    if (posR.z <= 0.001 || posR.w <= 0.002) continue;
    if (posR.z > 0.022) {
      vec2 ds = p - (posR.xy + vec2(0.010, -0.022));
      float rSh = posR.z * 1.45;
      if (dot(ds, ds) < rSh * rSh) {
        float sh = smoothstep(rSh, posR.z * 0.2, length(ds)) * 0.030 * posR.w * smoothstep(0.022, 0.060, posR.z);
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

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

const INITIAL_ITEMS = [
  { initials: 'JR', name: 'Jo Reyes',       preview: 'Shared updated motion specs',    time: '2m',  fresh: false },
  { initials: 'AO', name: 'Ari Okafor',     preview: 'Pushed thin-film shader pass',   time: '14m', fresh: false },
  { initials: 'DP', name: 'Deploy preview', preview: 'Build #184 is ready to view',    time: '1h',  fresh: false },
  { initials: 'SC', name: 'Sam Cho',        preview: 'Uploaded new foley samples',     time: '3h',  fresh: false },
];

class PullToRefreshBubble {
  constructor(container, opts = {}) {
    this.width = opts.width || 640;
    this.height = opts.height || 360;
    this.aspect = this.width / this.height;
    this.dpr = opts.dpr || 2;
    this.audio = opts.audio || null;
    this.refreshDuration = opts.refreshDuration || 1.35;
    this.onRefresh = opts.onRefresh || (() => {});
    this.onStart = opts.onStart || (() => {});
    this.startItems = opts.items || null;
    this.waiting = false;   // set by the element while the page is still loading
    this.incoming = [];     // rows the page handed over, put on top when the film pops

    // Card layout in logical CSS pixels (centered cleanly on pure #FFFFFF)
    this.cardW = Math.min(342, this.width - 28);
    this.cardH = Math.min(324, this.height - 24);
    this.cardX = (this.width - this.cardW) * 0.5;
    this.cardY = (this.height - this.cardH) * 0.5;
    this.cardR = 22;
    this.headerH = 48;
    this.rowH = 66;
    this.seamYCss = this.cardY + this.headerH;

    // Pull & refresh distances in CSS pixels
    this.pullThresholdCss = 104;
    this.maxGapCss = 124;
    this.refreshBaseGapCss = 88;
    this.refreshPeakGapCss = 102;

    // Derived NDC anchors
    this.seamY = this._toNdcY(this.seamYCss);
    this.cardHalfX = this._pxToNdc(this.cardW * 0.5);

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

    // 64x64 2D Navier-Stokes fluid grid + wave heightfield
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

    this.maxDaughters = 16;
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
      'uSeamY', 'uCardHalfX', 'uListTopY',
      'uBubbleAlpha', 'uPull', 'uStretchBow', 'uDragShiftX',
      'uRefreshProg', 'uSpinEnergy', 'uTension', 'uInflate',
      'uSeamWave', 'uSeamWaveR',
      'uRuptureR', 'uRupturePos', 'uDaughterCount',
    ];
    this.u = {};
    for (const n of names) this.u[n] = gl.getUniformLocation(this.prog, n);
    this.u.uDPos = gl.getUniformLocation(this.prog, 'uDPos') || gl.getUniformLocation(this.prog, 'uDPos[0]');
    this.u.uDOpt = gl.getUniformLocation(this.prog, 'uDOpt') || gl.getUniformLocation(this.prog, 'uDOpt[0]');
  }

  reset() {
    this.time = 1.0;
    this.phase = 'idle'; // 'idle' | 'pulling' | 'canceling' | 'refreshing' | 'settling'
    this.dragging = false;

    this.targetGapCss = 0;
    this.gapCss = 0;
    this.gapVel = 0;

    this.dragOffsetXCss = 0;
    this.pull = 0;
    this.refreshTimer = 0;
    this.refreshProg = 0;
    this.settleDelay = 0;

    this.bubbleAlpha = 0;
    this.stretchBow = 0;
    this.seamWave = 0;
    this.seamWaveR = 0;
    this.spinEnergy = 0;

    this.inflate = 1.0;
    this.inflateVel = 0;

    this.ruptureActive = false;
    this.ruptureR = -1;
    this.rupturePos = { x: 0.30, y: this.seamY - 0.25 };
    this.popRect = null;

    this.floatBubbles = [];
    this.pendingDaughters = [];
    this.droplets = [];
    this.popPuffs = [];

    this.items = (this.startItems || INITIAL_ITEMS).map((it) => ({ ...it, fresh: false }));
    this.incomingIdx = 0;
    this.refreshedCount = 0;
    this.justRefreshedTimer = 0;
    this.newRowSlide = 1.0;
    this.newRowFlash = 0.0;

    this._seedFilm();
  }

  feedGrabStagePos() {
    return {
      x: this.width * 0.5,
      y: this.seamYCss + 46,
    };
  }

  isInsideFeedStage(sx, sy) {
    return (
      sx >= this.cardX &&
      sx <= this.cardX + this.cardW &&
      sy >= this.seamYCss &&
      sy <= this.cardY + this.cardH
    );
  }

  beginPull(startX = this.width * 0.5) {
    if (this.phase === 'refreshing') return;
    this.audio?.unlock();
    this.dragging = true;
    this.dragStartX = startX;
    if (this.phase === 'idle' || this.phase === 'canceling' || this.phase === 'settling') {
      this.phase = 'pulling';
      this.ruptureActive = false;
      this.ruptureR = -1;
    }
  }

  updatePull(dyCss, dxCss = 0) {
    if (!this.dragging || this.phase !== 'pulling') return;
    const raw = Math.max(0, dyCss);
    const norm = raw / this.pullThresholdCss;
    const damped = norm <= 1.0
      ? norm * this.pullThresholdCss
      : this.pullThresholdCss + (this.maxGapCss - this.pullThresholdCss) * (1 - Math.exp(-(norm - 1.0) * 1.45));

    this.targetGapCss = Math.min(this.maxGapCss, damped);
    this.dragOffsetXCss = Math.max(-28, Math.min(28, dxCss * 0.34));

    const prevPull = this.pull;
    const livePull = Math.min(1.22, this.targetGapCss / this.pullThresholdCss);
    this.audio?.updateTension(Math.min(0.75, livePull * 0.65));

    const spd = Math.abs(livePull - prevPull) * 26;
    if (spd > 0.03) this.audio?.updateGlide(Math.min(0.82, spd));
  }

  endPull() {
    if (!this.dragging) return;
    this.dragging = false;
    this.audio?.updateGlide(0);

    if (this.phase !== 'pulling') return;

    if (this.pull >= 0.78) {
      // Trigger refresh: lock open the rectangular soap membrane, swell to full pressure, then Culick-pop!
      this.phase = 'refreshing';
      this.refreshTimer = 0;
      this.refreshProg = 0;
      this.targetGapCss = this.refreshBaseGapCss;
      this.dragOffsetXCss = 0;
      this.inflateVel += 0.9;
      this._impulseZ(0, 0, 0.24, 0.42);
      this.audio?.playPinchOff();
      this.onStart();
    } else {
      // Early release -> opening glides shut, compressing the rectangular film back into the hairline
      this.phase = 'canceling';
      this.targetGapCss = 0;
      this.dragOffsetXCss = 0;
      this.audio?.updateTension(0);
      if (this.pull > 0.14) {
        this.audio?.playRefilm();
      }
    }
  }

  _triggerCompletePop() {
    this.phase = 'settling';
    this.settleDelay = 0.21;
    this.ruptureActive = true;
    this.ruptureR = 0.035;
    this.spinEnergy = 0;

    this.audio?.updateTension(0);
    this.audio?.playPop(1.38);
    this.audio?.playFizz(0.78);

    const cx = 0.0;
    const cy = this._toNdcY(this.seamYCss + this.gapCss * 0.5);
    const hx = this.cardHalfX - 0.007;
    const hy = Math.max(0.04, this._pxToNdc(this.gapCss * 0.5) - 0.004);
    this.popRect = { cx, cy, hx, hy };
    // Puncture right-of-center so the beaded Culick tear zips dramatically across the entire rectangle!
    this.rupturePos = { x: cx + hx * 0.34, y: cy + hy * 0.16 };
    this.pendingDaughters = [];

    // Schedule 15 power-law sized true 3D WebGL2 daughter bubbles across the entire rectangular film!
    const count = 15;
    for (let i = 0; i < count; i++) {
      const lane = ((i + 0.5) / count) * 2.0 - 1.0;
      const sx = cx + Math.max(-0.94, Math.min(0.94, lane + (Math.random() - 0.5) * 0.20)) * hx;
      const sy = cy + (Math.random() - 0.5) * 1.62 * hy;
      const dxR = sx - this.rupturePos.x;
      const dyR = sy - this.rupturePos.y;
      const distR = Math.hypot(dxR, dyR);
      const nxR = distR > 0.001 ? dxR / distR : (Math.random() - 0.5);
      const nyR = distR > 0.001 ? dyR / distR : 0.6;

      const u = Math.random();
      const rNdc = u > 0.80 ? (0.048 + Math.random() * 0.018)
                 : u > 0.42 ? (0.026 + Math.random() * 0.018)
                 : (0.013 + Math.random() * 0.012);

      const outSpd = (0.34 + Math.random() * 0.68) * (0.76 + 0.026 / Math.max(0.016, rNdc));
      this.pendingDaughters.push({
        spawnAtR: Math.max(0.04, distR * 0.96),
        x: sx,
        y: sy,
        vx: nxR * outSpd * 0.72 + (Math.random() - 0.5) * 0.22,
        vy: nyR * outSpd * 0.62 + 0.18 + Math.random() * 0.18,
        r: rNdc,
        dNm: 185 + Math.random() * 440,
        wobAmp: 0.17 + Math.random() * 0.12,
        wobPhase: Math.random() * Math.PI * 2,
        wobFreq: 13.5 + Math.random() * 8.5,
        driftPhase: Math.random() * Math.PI * 2,
        driftAmp: 0.05 + Math.random() * 0.06,
        buoyancy: 0.07 + (0.048 / Math.max(0.018, rNdc)) * 0.06,
        drag: 2.7 + Math.random() * 1.1,
        age: 0,
        life: 1.0,
        decay: 0.32 + Math.random() * 0.30,
      });
    }

    // Immediate pinhole micro-spray at puncture origin
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 0.55 + Math.random() * 1.35;
      const isBead = Math.random() < 0.38;
      this.droplets.push({
        kind: isBead ? 'bead' : 'mist',
        x: this.rupturePos.x + Math.cos(a) * 0.012,
        y: this.rupturePos.y + Math.sin(a) * 0.012,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: isBead ? (1.2 + Math.random() * 1.1) : (0.55 + Math.random() * 0.7),
        drag: isBead ? (2.1 + Math.random() * 0.9) : (5.0 + Math.random() * 2.0),
        gravity: isBead ? (0.45 + Math.random() * 0.32) : (0.02 + Math.random() * 0.05),
        life: 1.0,
        decay: isBead ? (0.85 + Math.random() * 0.55) : (1.0 + Math.random() * 0.9),
        tint: 195 + Math.random() * 95,
        driftPhase: Math.random() * Math.PI * 2,
      });
    }

    // Prepend fresh incoming feed item & trigger smooth arrival
    const fresh = this.incoming.splice(0);
    const nextItem = fresh[0] || null;
    this.incomingIdx += fresh.length;
    for (const it of this.items) it.fresh = false;
    for (let i = fresh.length - 1; i >= 0; i--) this.items.unshift({ ...fresh[i], fresh: true });
    while (this.items.length > 5) this.items.pop();
    if (!fresh.length) { this.newRowSlide = 1.0; this.newRowFlash = 0.0; this.onRefresh(null, this.refreshedCount); this.seamWave = 0.85; this.seamWaveR = 0.04; return; }

    this.refreshedCount += 1;
    this.justRefreshedTimer = 5.0;
    this.newRowSlide = 0.0;
    this.newRowFlash = 1.0;

    // Crisp horizontal capillary wave along the hairline as the frame closes
    this.seamWave = 0.85;
    this.seamWaveR = 0.04;

    this.onRefresh(nextItem, this.refreshedCount);
  }

  _emitRimSpray(prevR, nextR) {
    if (!this.popRect) return;
    const g = this.popRect;
    const rp = this.rupturePos;

    for (let i = this.pendingDaughters.length - 1; i >= 0; i--) {
      const d = this.pendingDaughters[i];
      if (d.spawnAtR <= nextR) {
        if (this.floatBubbles.length >= this.maxDaughters) this.floatBubbles.shift();
        this.floatBubbles.push(d);
        this.pendingDaughters.splice(i, 1);
      }
    }

    const midR = 0.5 * (prevR + nextR);
    const maxSpan = Math.hypot(g.hx * 2.0, g.hy * 2.0);
    if (midR > maxSpan) return;
    const samples = 14;
    for (let s = 0; s < samples; s++) {
      const a = Math.random() * Math.PI * 2;
      const sx = rp.x + Math.cos(a) * midR;
      const sy = rp.y + Math.sin(a) * midR;
      if (Math.abs(sx - g.cx) > g.hx * 1.04 || Math.abs(sy - g.cy) > g.hy * 1.08) continue;

      const isBead = Math.random() < 0.34;
      const spd = isBead ? (0.65 + Math.random() * 1.25) : (0.45 + Math.random() * 1.05);
      const dirX = Math.cos(a) * 0.85 + (Math.random() - 0.5) * 0.32;
      const dirY = Math.sin(a) * 0.85 + (Math.random() - 0.5) * 0.32;
      const dLen = Math.hypot(dirX, dirY) || 1;
      if (this.droplets.length > 155) this.droplets.shift();
      this.droplets.push({
        kind: isBead ? 'bead' : 'mist',
        x: sx,
        y: sy,
        vx: (dirX / dLen) * spd,
        vy: (dirY / dLen) * spd + (isBead ? 0.06 : 0.04),
        r: isBead ? (1.2 + Math.random() * 1.25) : (0.5 + Math.random() * 0.75),
        drag: isBead ? (2.0 + Math.random() * 1.0) : (4.8 + Math.random() * 2.2),
        gravity: isBead ? (0.46 + Math.random() * 0.35) : (0.01 + Math.random() * 0.05),
        life: 1.0,
        decay: isBead ? (0.75 + Math.random() * 0.6) : (0.9 + Math.random() * 0.85),
        tint: 185 + Math.random() * 120,
        driftPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  _seedFilm() {
    const { nx, ny } = this;
    const ph = 1.15;
    for (let j = 0; j < ny; j++) {
      const v = j / (ny - 1);
      for (let i = 0; i < nx; i++) {
        const u = i / (nx - 1);
        const idx = j * nx + i;
        const wave = 0.24 * Math.sin(u * 4.2 + ph) * Math.sin(v * Math.PI)
                   + 0.16 * Math.cos(u * 2.6 - v * 3.1 + ph * 0.7);
        this.thick[idx] = Math.max(0.08, Math.min(0.92, 0.20 + (1.0 - v) * 0.48 + wave));
        this.z[idx] = 0;
        this.zPrev[idx] = 0;
        this.shimmer[idx] = 0.08;
        this.vx[idx] = Math.sin(v * Math.PI * 2 + ph) * 0.6;
        this.vy[idx] = Math.cos(u * Math.PI * 2 - ph) * 0.5;
      }
    }
    this._injectVortex(-0.24, 0.12, 0.48, 3.0);
    this._injectVortex(0.24, -0.10, 0.46, -2.8);
    for (let s = 0; s < 14; s++) this._stepFluid(0.025);
  }

  _injectSheetStretchFlow(strength) {
    // Streams colorful thin-film bands downward across the entire width of the stretched rectangle
    const { nx, ny, vx, vy, thick, shimmer } = this;
    for (let j = 2; j < ny - 2; j++) {
      const v = j / (ny - 1);
      const wy = Math.sin(v * Math.PI);
      for (let i = 2; i < nx - 2; i++) {
        const u = i / (nx - 1);
        const wx = Math.sin(u * Math.PI);
        const w = wx * wy;
        if (w < 0.04) continue;
        const idx = j * nx + i;
        vy[idx] -= strength * w;
        vx[idx] += Math.sin(u * 6.28 + this.time * 2.6) * strength * 0.26 * w;
        const freshD = 0.30 + 0.34 * Math.sin(u * 5.2 - this.time * 2.4 + v * 2.0);
        thick[idx] += (freshD - thick[idx]) * Math.min(0.14, w * 0.08);
        shimmer[idx] = Math.min(1, shimmer[idx] + w * 0.03);
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
    // Gentle molecular surface-tension diffusion keeps thin-film Marangoni ribbons velvety smooth (zero grid fold)
    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        const avg = 0.25 * (thickTmp[idx - 1] + thickTmp[idx + 1] + thickTmp[idx - nx] + thickTmp[idx + nx]);
        thick[idx] = thickTmp[idx] + (avg - thickTmp[idx]) * 0.14;
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

    // 1. Feed opening spring physics
    const gapStiff = this.phase === 'pulling' ? 280 : (this.phase === 'canceling' ? 185 : 130);
    const gapDamp  = this.phase === 'pulling' ? 25  : (this.phase === 'canceling' ? 19  : 17);
    this.gapVel += ((this.targetGapCss - this.gapCss) * gapStiff - this.gapVel * gapDamp) * h;
    this.gapCss = Math.max(0, this.gapCss + this.gapVel * h);

    // 2. Phase progression
    if (this.phase === 'pulling') {
      this.pull = Math.max(0, Math.min(1.25, this.gapCss / this.pullThresholdCss));
      this.bubbleAlpha = Math.min(1.0, this.gapCss / 2.5);
      this.spinEnergy *= Math.exp(-5.0 * h);
      this.refreshProg = 0;

      // Subtle minimal-surface inward bow along sides proportional to active downward stretch
      const targetBow = Math.min(0.018, Math.max(0, this.gapVel * 0.00009) + this.pull * 0.008);
      this.stretchBow += (targetBow - this.stretchBow) * Math.min(1, h * 12);

      // Stream vivid Marangoni color bands downward across the stretching rectangular sheet
      const flowStr = Math.max(0.5, this.gapVel * 0.015 + this.pull * 1.1);
      this._injectSheetStretchFlow(flowStr * h * 14);
      this._injectVortex(-0.34, 0.04, 0.42, (0.45 + this.pull * 0.85) * h * 14);
      this._injectVortex(0.34, -0.04, 0.42, -(0.45 + this.pull * 0.85) * h * 14);
    } else if (this.phase === 'canceling') {
      const prevGap = this.gapCss;
      this.pull = Math.max(0, this.gapCss / this.pullThresholdCss);
      this.bubbleAlpha = Math.min(1.0, this.gapCss / 2.8);
      this.stretchBow *= Math.exp(-10 * h);
      this.spinEnergy *= Math.exp(-6 * h);

      if (prevGap > 6 && this.gapCss <= 6) {
        // Compressed soap sheet seals smoothly back into hairline -> glistening horizontal ripple!
        this.seamWave = 0.82;
        this.seamWaveR = 0.04;
      }
      if (this.gapCss < 0.35 && Math.abs(this.gapVel) < 2.0) {
        this.gapCss = 0;
        this.gapVel = 0;
        this.pull = 0;
        this.bubbleAlpha = 0;
        this.phase = 'idle';
      }
    } else if (this.phase === 'refreshing') {
      this.refreshTimer += h;
      this.refreshProg = Math.max(0, Math.min(1, this.refreshTimer / this.refreshDuration));
      this.bubbleAlpha = 1.0;
      this.stretchBow *= Math.exp(-11 * h); // presses 100% flush against the left/right walls!
      this.spinEnergy += (1.0 - this.spinEnergy) * Math.min(1, h * 7.0);

      // Gently pressurize & swell the rectangular opening taller as refresh charges to 100%
      const swellEase = this.refreshProg * this.refreshProg * (3 - 2 * this.refreshProg);
      this.targetGapCss = this.refreshBaseGapCss + (this.refreshPeakGapCss - this.refreshBaseGapCss) * swellEase;
      this.audio?.updateTension(0.20 + this.refreshProg * 0.72);

      // Bilateral Marangoni vortices sweeping luminous rainbow ribbons across the full rectangle!
      const sw = this.time * 2.5;
      this._injectVortex(-0.36, 0.04, 0.50, (1.6 + this.refreshProg * 1.1) * h * 16);
      this._injectVortex(0.36, -0.04, 0.50, -(1.6 + this.refreshProg * 1.1) * h * 16);
      this._injectVortex(Math.cos(sw) * 0.22, Math.sin(sw) * 0.14, 0.40, 1.1 * h * 16);
      if (this.refreshProg > 0.68) {
        this._impulseZ(Math.cos(this.time * 11.5) * 0.46, Math.sin(this.time * 9.5) * 0.16, 0.024 * this.refreshProg, 0.24);
      }

      if (this.waiting && this.refreshTimer >= this.refreshDuration * 0.9) {
        this.refreshTimer = this.refreshDuration * 0.9;   // hold the film at nearly full until the page is done
      } else if (this.refreshTimer >= this.refreshDuration) {
        this._triggerCompletePop();
      }
    } else if (this.phase === 'settling') {
      this.stretchBow *= Math.exp(-12 * h);
      if (this.settleDelay > 0) {
        this.settleDelay -= h;
        if (this.settleDelay <= 0) {
          this.targetGapCss = 0;
        }
      }
      if (!this.ruptureActive && this.gapCss < 0.4 && Math.abs(this.gapVel) < 2.0) {
        this.gapCss = 0;
        this.gapVel = 0;
        this.pull = 0;
        this.refreshProg = 0;
        this.phase = 'idle';
      }
    }

    // 3. Hairline wet capillary wave
    if (this.seamWave > 0.002) {
      this.seamWaveR += h * 1.70;
      this.seamWave *= Math.exp(-3.3 * h);
    } else {
      this.seamWave = 0;
    }

    // 4. Full-width rectangular Culick rupture expansion
    if (this.ruptureActive) {
      const prevR = this.ruptureR;
      this.ruptureR += h * 6.8;
      this._emitRimSpray(prevR, this.ruptureR);
      if (this.ruptureR > 1.68) {
        this.ruptureActive = false;
        this.ruptureR = -1;
        this.bubbleAlpha = 0;
      }
    }

    // 5. 3D dome inflation puffiness (builds lusciously as refresh charges to 100%!)
    const targetInflate = this.phase === 'refreshing'
      ? (1.06 + this.refreshProg * 0.34 + 0.05 * Math.sin(this.time * 4.5))
      : (0.94 + Math.min(1, this.pull) * 0.14 + 0.04 * Math.sin(this.time * 3.0));
    this.inflateVel += ((targetInflate - this.inflate) * 90 - this.inflateVel * 7.5) * h;
    this.inflate += this.inflateVel * h;

    // 6. Feed item arrival & status timers
    if (this.newRowSlide < 1.0) {
      this.newRowSlide = Math.min(1.0, this.newRowSlide + h * 3.6);
    }
    if (this.newRowFlash > 0) {
      this.newRowFlash = Math.max(0, this.newRowFlash - h * 0.95);
    }
    if (this.justRefreshedTimer > 0) {
      this.justRefreshedTimer = Math.max(0, this.justRefreshedTimer - h);
    }

    // 7. Fluid simulation + wave heightfield update
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

    // 8. True 3D daughter soap bubbles (post-pop cluster)
    for (let i = this.floatBubbles.length - 1; i >= 0; i--) {
      const b = this.floatBubbles[i];
      b.age += h;
      const df = Math.exp(-b.drag * h);
      b.vx *= df;
      b.vy = b.vy * df + b.buoyancy * h;
      const swayX = Math.sin(this.time * 2.4 + b.driftPhase) * b.driftAmp;
      b.x += (b.vx + swayX) * h;
      b.y += b.vy * h;
      b.wobPhase += b.wobFreq * h;
      b.wobAmp *= Math.exp(-2.8 * h);
      b.life -= b.decay * h;
      if (b.life <= 0) {
        this.popPuffs.push({ x: b.x, y: b.y, r: b.r * 0.9, rTarget: b.r * 1.9, life: 0.72, decay: 3.0 });
        for (let k = 0; k < 4; k++) {
          const ka = (k / 4) * Math.PI * 2 + Math.random() * 0.7;
          const kSpd = 0.22 + Math.random() * 0.42;
          if (this.droplets.length > 155) this.droplets.shift();
          this.droplets.push({
            kind: 'mist',
            x: b.x + Math.cos(ka) * b.r * 0.75,
            y: b.y + Math.sin(ka) * b.r * 0.75,
            vx: Math.cos(ka) * kSpd,
            vy: Math.sin(ka) * kSpd,
            r: 0.55 + Math.random() * 0.55,
            drag: 6.2,
            gravity: 0.03,
            life: 0.80,
            decay: 2.3 + Math.random() * 1.0,
            tint: 210 + Math.random() * 60,
            driftPhase: Math.random() * Math.PI * 2,
          });
        }
        this.floatBubbles.splice(i, 1);
      }
    }

    // 9. Water droplets & micro-vapor puffs
    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const d = this.droplets[i];
      const df = Math.exp(-d.drag * h);
      d.vx *= df;
      d.vy = d.vy * df - d.gravity * h;
      const turb = d.kind === 'mist' ? Math.sin(this.time * 2.1 + d.driftPhase) * 0.04 : 0;
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

  _drawUnderCard() {
    const ctx = this.underCtx;
    const dpr = this.dpr;
    const W = this.underCanvas.width;
    const H = this.underCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = this.cardX * dpr;
    const cy = this.cardY * dpr;
    const cw = this.cardW * dpr;
    const ch = this.cardH * dpr;
    const cr = this.cardR * dpr;
    const hh = this.headerH * dpr;
    const seamY = this.seamYCss * dpr;
    const gap = this.gapCss * dpr;

    ctx.save();

    // Soft floating card shadow on pure #FFFFFF
    ctx.save();
    ctx.shadowColor = 'rgba(20, 22, 38, 0.075)';
    ctx.shadowBlur = 28 * dpr;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 9 * dpr;
    roundRectPath(ctx, cx, cy, cw, ch, cr);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    // Clip everything inside the rounded card
    ctx.save();
    roundRectPath(ctx, cx, cy, cw, ch, cr);
    ctx.clip();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx, cy, cw, ch);

    // Subtle cool-airy depth tint inside the opened refresh rectangle
    if (gap > 0.5) {
      const gapAlpha = Math.min(1, gap / (44 * dpr));
      const gGrad = ctx.createLinearGradient(0, seamY, 0, seamY + gap);
      gGrad.addColorStop(0, `rgba(244, 246, 252, ${0.85 * gapAlpha})`);
      gGrad.addColorStop(0.55, `rgba(251, 252, 255, ${0.55 * gapAlpha})`);
      gGrad.addColorStop(1, `rgba(255, 255, 255, 0)`);
      ctx.fillStyle = gGrad;
      ctx.fillRect(cx, seamY, cw, gap);
    }

    // --- SCROLLABLE FEED ROWS (clipped strictly below header seam) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, seamY, cw, ch - hh);
    ctx.clip();

    const listTop = seamY + gap;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx, listTop, cw, ch);

    if (gap > 1.5) {
      const sepA = Math.min(1, gap / (22 * dpr));
      ctx.fillStyle = `rgba(22, 22, 34, ${0.075 * sepA})`;
      ctx.fillRect(cx, listTop, cw, 1 * dpr);
    }

    const rowH = this.rowH * dpr;
    const padX = 18 * dpr;
    const slideEase = 1 - Math.pow(1 - this.newRowSlide, 3);

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      let rowY;
      let rowAlpha = 1.0;
      if (i === 0 && this.newRowSlide < 1.0) {
        rowY = listTop - rowH * (1 - slideEase) * 0.45;
        rowAlpha = slideEase;
      } else if (this.newRowSlide < 1.0) {
        rowY = listTop + (i - (1 - slideEase)) * rowH;
      } else {
        rowY = listTop + i * rowH;
      }

      if (rowY > cy + ch + 10 * dpr) continue;

      ctx.save();
      ctx.globalAlpha = rowAlpha;

      if (i === 0 && this.newRowFlash > 0.01) {
        ctx.fillStyle = `rgba(24, 150, 118, ${this.newRowFlash * 0.075})`;
        ctx.fillRect(cx, rowY, cw, rowH);
      }

      if (i > 0) {
        ctx.fillStyle = 'rgba(22, 22, 30, 0.06)';
        ctx.fillRect(cx + padX + 42 * dpr, rowY, cw - padX * 2 - 42 * dpr, 1 * dpr);
      }

      const avR = 16.5 * dpr;
      const avX = cx + padX + avR;
      const avY = rowY + rowH * 0.5;
      ctx.beginPath();
      ctx.arc(avX, avY, avR, 0, Math.PI * 2);
      ctx.fillStyle = item.fresh ? 'rgba(24, 121, 94, 0.11)' : '#F2F3F7';
      ctx.fill();
      ctx.strokeStyle = item.fresh ? 'rgba(24, 121, 94, 0.24)' : 'rgba(22, 22, 34, 0.06)';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();

      ctx.font = `600 ${11 * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = item.fresh ? '#166D55' : '#4C5062';
      ctx.fillText(item.initials, avX, avY + 0.5 * dpr);

      const textX = cx + padX + 44 * dpr;
      const titleY = rowY + rowH * 0.36;
      const subY = rowY + rowH * 0.66;

      ctx.font = `600 ${13 * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#18181E';
      ctx.fillText(item.name, textX, titleY);

      if (item.fresh) {
        const nw = ctx.measureText(item.name).width;
        ctx.beginPath();
        ctx.arc(textX + nw + 8 * dpr, titleY, 3 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = '#18795E';
        ctx.fill();
      }

      ctx.font = `500 ${11 * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = item.fresh ? '#18795E' : '#9698A6';
      ctx.fillText(item.time, cx + cw - padX, titleY);

      ctx.font = `400 ${12 * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#6E7180';
      ctx.fillText(item.preview, textX, subY);

      ctx.restore();
    }

    const botFade = ctx.createLinearGradient(0, cy + ch - 28 * dpr, 0, cy + ch);
    botFade.addColorStop(0, 'rgba(255, 255, 255, 0)');
    botFade.addColorStop(1, 'rgba(255, 255, 255, 0.92)');
    ctx.fillStyle = botFade;
    ctx.fillRect(cx, cy + ch - 28 * dpr, cw, 28 * dpr);

    ctx.restore(); // end rows clip

    // --- PINNED HEADER BAR ---
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx, cy, cw, hh);

    const hMidY = cy + hh * 0.5 + 0.5 * dpr;
    ctx.font = `650 ${14.5 * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#16161C';
    ctx.fillText('Inbox', cx + padX, hMidY);

    let statusText = 'Updated 2m ago';
    let statusColor = '#9093A2';
    let showDot = false;

    if (this.phase === 'pulling' && this.pull > 0.08) {
      if (this.pull >= 0.78) {
        statusText = 'Release to refresh';
        statusColor = '#3E476B';
      } else {
        statusText = 'Pull to refresh';
        statusColor = '#848899';
      }
    } else if (this.phase === 'refreshing') {
      statusText = 'Refreshing…';
      statusColor = '#465072';
    } else if (this.refreshedCount > 0 && this.justRefreshedTimer > 0) {
      statusText = 'Just now';
      statusColor = '#18795E';
      showDot = true;
    }

    ctx.font = `500 ${11.5 * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = statusColor;
    ctx.fillText(statusText, cx + cw - padX, hMidY);

    if (showDot) {
      const sw = ctx.measureText(statusText).width;
      ctx.beginPath();
      ctx.arc(cx + cw - padX - sw - 8 * dpr, hMidY, 3 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#18795E';
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(22, 22, 34, 0.09)';
    ctx.fillRect(cx, seamY - 0.5 * dpr, cw, 1 * dpr);

    ctx.restore(); // end card clip

    roundRectPath(ctx, cx + 0.5 * dpr, cy + 0.5 * dpr, cw - 1 * dpr, ch - 1 * dpr, cr);
    ctx.strokeStyle = 'rgba(22, 22, 34, 0.085)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    ctx.restore();
  }

  _drawWaterDroplet(ctx, px, py, rPx, vx, vy, alpha, tintHue, kind) {
    if (rPx < 0.45 || alpha <= 0.015) return;
    const spd = Math.hypot(vx, vy);
    const stretch = kind === 'bead'
      ? Math.min(2.3, 1.0 + Math.max(0, spd - 0.35) * 0.55)
      : Math.min(1.7, 1.0 + Math.max(0, spd - 0.55) * 0.40);
    const ang = spd > 0.04 ? Math.atan2(-vy, vx) : 0;

    ctx.save();
    ctx.translate(px, py);
    if (stretch > 1.04) ctx.rotate(ang);
    ctx.scale(stretch, 1 / Math.sqrt(stretch));

    if (kind === 'mist' || rPx < 2.2) {
      ctx.fillStyle = `rgba(96, 114, 158, ${alpha * 0.36})`;
      ctx.beginPath();
      ctx.arc(rPx * 0.16, rPx * 0.18, rPx * 1.05, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.90})`;
      ctx.beginPath();
      ctx.arc(-rPx * 0.14, -rPx * 0.16, rPx * 0.62, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(-rPx * 0.28, -rPx * 0.28, rPx * 0.08, 0, 0, rPx);
      grad.addColorStop(0.0, `rgba(255, 255, 255, ${alpha * 0.92})`);
      grad.addColorStop(0.45, `rgba(244, 248, 255, ${alpha * 0.28})`);
      grad.addColorStop(0.78, `hsla(${tintHue}, 36%, 62%, ${alpha * 0.34})`);
      grad.addColorStop(0.95, `rgba(74, 92, 142, ${alpha * 0.54})`);
      grad.addColorStop(1.0, `rgba(255, 255, 255, ${alpha * 0.65})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rPx, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(78, 94, 142, ${alpha * 0.44})`;
      ctx.lineWidth = Math.max(0.7, rPx * 0.16);
      ctx.beginPath();
      ctx.arc(0, 0, rPx * 0.90, 0.05 * Math.PI, 0.72 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.98})`;
      ctx.beginPath();
      ctx.arc(-rPx * 0.32, -rPx * 0.32, Math.max(0.65, rPx * 0.30), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  render() {
    this._drawUnderCard();

    const { gl, u } = this;
    gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.nx, this.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.texData);

    const tension = this.phase === 'refreshing'
      ? Math.max(0, (this.refreshProg - 0.52) / 0.48)
      : Math.max(0, (Math.min(1, this.pull) - 0.68) / 0.32) * 0.55;

    gl.uniform1i(u.uSim, 0);
    gl.uniform2f(u.uRes, this.glCanvas.width, this.glCanvas.height);
    gl.uniform2f(u.uSize, this.width, this.height);
    gl.uniform1f(u.uTime, this.time);

    gl.uniform1f(u.uSeamY, this.seamY);
    gl.uniform1f(u.uCardHalfX, this.cardHalfX);
    gl.uniform1f(u.uListTopY, this._toNdcY(this.seamYCss + this.gapCss));

    gl.uniform1f(u.uBubbleAlpha, this.bubbleAlpha);
    gl.uniform1f(u.uPull, this.pull);
    gl.uniform1f(u.uStretchBow, this.stretchBow);
    gl.uniform1f(u.uDragShiftX, this._pxToNdc(this.dragOffsetXCss));
    gl.uniform1f(u.uRefreshProg, this.refreshProg);
    gl.uniform1f(u.uSpinEnergy, this.spinEnergy);
    gl.uniform1f(u.uTension, tension);
    gl.uniform1f(u.uInflate, Math.max(0.1, this.inflate));

    gl.uniform1f(u.uSeamWave, this.seamWave);
    gl.uniform1f(u.uSeamWaveR, this.seamWaveR);
    gl.uniform1f(u.uRuptureR, this.ruptureActive ? this.ruptureR : -1.0);
    gl.uniform2f(u.uRupturePos, this.rupturePos.x, this.rupturePos.y);

    // Upload true 3D WebGL2 daughter soap bubbles
    this.dPosBuf.fill(0);
    this.dOptBuf.fill(0);
    const nD = Math.min(this.maxDaughters, this.floatBubbles.length);
    for (let i = 0; i < nD; i++) {
      const b = this.floatBubbles[i];
      const birthScale = Math.min(1.0, b.age / 0.05);
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
    gl.uniform1i(u.uDaughterCount, nD);
    if (u.uDPos) gl.uniform4fv(u.uDPos, this.dPosBuf);
    if (u.uDOpt) gl.uniform4fv(u.uDOpt, this.dOptBuf);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Fine Rayleigh-Plateau water droplets, aerosol mist & micro-vapor pop rings
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
      const evap = 0.58 + 0.42 * Math.min(1, d.life * 1.4);
      this._drawWaterDroplet(ctx, px, py, d.r * dpr * evap, d.vx, d.vy, a, d.tint, d.kind);
    }
  }
}
