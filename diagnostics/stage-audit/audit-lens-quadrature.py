#!/usr/bin/env python3
"""CPU audit of the legacy and final foreground gathers; JSON goes to stdout.

No third-party dependencies, rendering, asset edits, or generated output files.
This is a numerical kernel test, not browser/GPU evidence or exact optical DOF.
"""
import json
import math

CAP = 2048 * .08
ANGLES = 32
EDGE_POINTS = 128
STRIP_POINTS = 256


def smoothstep(a, b, x):
    t = max(0, min(1, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def ideal_halfplane(x, radius):
    t = max(-1, min(1, x / radius))
    return .5 - (t * math.sqrt(max(0, 1 - t * t)) + math.asin(t)) / math.pi


def radial_area(r, radius):
    """Same softDiscArea polynomial as src/renderer.js and lens-support.js."""
    a = radius - .5
    if r <= a:
        return r * r
    if r >= radius + .5:
        return radius * radius + .05
    t = r - a
    return a*a + 2*(a*(t - t**3 + .5*t**4) + (.5*t*t - .75*t**4 + .4*t**5))


def base2_fraction(index):
    value, scale = 0, .5
    while index:
        value += (index & 1) * scale
        index >>= 1
        scale *= .5
    return value


def kernel(radius, support, legacy=False):
    points = []
    count = 24 if legacy else 32 if support < 16 else 64 if support < 64 else 96
    pairs = count // 2
    for index in range(count if legacy else pairs):
        if legacy:
            t = (index + .5) / 24
            distance, angle = t * CAP, index * 2.399963
            weight = (1 - smoothstep(radius*.65, radius+.75, distance))
            weight *= 2*t*CAP*CAP / (max(1, radius*radius) * 24)
        else:
            search = support + .5  # Include feather; physical CoC cap is unchanged.
            t = (index + .5) / pairs
            distance, angle = t*t*search, math.pi*base2_fraction(index)
            lo, hi = (index/pairs)**2*search, ((index+1)/pairs)**2*search
            weight = max(0, radial_area(hi, radius) - radial_area(lo, radius))
            weight /= 2 * (radius*radius + .05)
        if weight > 0:
            for sign in ([1] if legacy else [-1, 1]):
                points.append((sign*distance*math.cos(angle), sign*distance*math.sin(angle), weight))
    return count, points


def measure(radius, support, legacy=False):
    count, points = kernel(radius, support, legacy)
    edge_errors, mirror_errors, half_pixels, strip_errors, strip_energy = [], [], [], [], []
    for angle_index in range(ANGLES):
        angle = angle_index * math.pi / ANGLES
        taps = [(x*math.cos(angle)+y*math.sin(angle), w) for x, y, w in points]

        def alpha(x, side=1, strip=False):
            return min(1, sum(w for dx, w in taps
                              if (abs(x+dx) < 1.5 if strip else (x+dx)*side < 0)))

        xs = [radius*(i+.5)/EDGE_POINTS for i in range(EDGE_POINTS)]
        edge_errors.append(sum(abs(alpha(x)-ideal_halfplane(x, radius)) for x in xs)/EDGE_POINTS)
        mirror_errors.append(max(abs(alpha(x)-alpha(-x, -1)) for x in xs))
        half_pixels.append(alpha(.5))
        xs = [(i+.5)*(2*radius+3)/STRIP_POINTS-radius-1.5 for i in range(STRIP_POINTS)]
        strip_errors.append(sum(abs(alpha(x, strip=True) -
                                    (ideal_halfplane(x-1.5, radius)-ideal_halfplane(x+1.5, radius)))
                                for x in xs)/STRIP_POINTS)
        strip_energy.append(sum(alpha(x, strip=True) for x in xs)*(2*radius+3)/STRIP_POINTS/3)
    return {
        'tapBudget': count, 'positiveWeightTaps': len(points),
        'radialMass': sum(w for _, _, w in points),
        'worstAngleEdgeMAE': max(edge_errors), 'worstMirrorDelta': max(mirror_errors),
        'halfPixelAlphaMin': min(half_pixels), 'halfPixelAlphaMax': max(half_pixels),
        'worstAngleStripMAE': max(strip_errors),
        'stripEnergyInPhysicalHaloMin': min(strip_energy),
        'stripEnergyInPhysicalHaloMax': max(strip_energy),
    }


def main():
    cases = []
    for radius in [1.1, 1.3, 5.095, 20]:
        supports = sorted(set([radius, radius*1.5, min(CAP, radius*3), min(CAP, radius*8),
                               min(CAP, radius*32), CAP*.95, CAP*.975, CAP]))
        cases.extend((radius, support) for support in supports)
    # f24.9136037681mm, f/1.4, focus1.4m, sensor36mm, width2048:
    # source minimum .771m -> support7.48185px, local edge1.2m -> radius1.52849px.
    cases.extend((1.5284853843938169, 7.481846745398528*factor) for factor in [.95, 1, 1.05])
    rows = [{'radius': r, 'certifiedSupport': s, 'supportRatio': s/r,
             'idealHalfPixelAlpha': ideal_halfplane(.5, r),
             'legacy': measure(r, s, True), 'candidate': measure(r, s)} for r, s in cases]
    summary = {}
    for method in ['legacy', 'candidate']:
        values = [row[method] for row in rows]
        summary[method] = {
            'worstEdgeMAE': max(v['worstAngleEdgeMAE'] for v in values),
            'worstMirrorDelta': max(v['worstMirrorDelta'] for v in values),
            'casesWithZeroHalfPixelSpill': sum(v['halfPixelAlphaMin'] < 1e-6 for v in values),
            'casesWithSaturatedHalfPixelSpill': sum(v['halfPixelAlphaMax'] > .9999 for v in values),
            'radialMassRange': [min(v['radialMass'] for v in values), max(v['radialMass'] for v in values)],
            'stripEnergyRange': [min(v['stripEnergyInPhysicalHaloMin'] for v in values),
                                 max(v['stripEnergyInPhysicalHaloMax'] for v in values)],
        }
    print(json.dumps({
        'scope': ('CPU foreground-layer quadrature, 32 edge angles. White near half-plane on focused black '
                  'background isolates the extra gather. Sharp point-sampled colors omit within-pixel bilinear '
                  'transitions. Three-pixel-strip energy measures the near-layer kernel, not full shader output '
                  'inside the foreground. Errors use an ideal hard disc, so the half-pixel feather remains an '
                  'intentional approximation. Exact radial mass does not imply exact angular/depth integration. '
                  'Cap perturbations use 95%,97.5%,100%; increases above the cap are clamped. No GPU/performance claim.'),
        'width': 2048, 'cocCap': CAP, 'edgeAngles': ANGLES, 'caseCount': len(rows),
        'summary': summary, 'cases': rows,
    }, separators=(',', ':')))


if __name__ == '__main__':
    main()
