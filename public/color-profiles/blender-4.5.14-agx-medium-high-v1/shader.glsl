
// Declaration of all variables

uniform highp sampler3D monkAgx_lut3d_0Sampler;
uniform highp sampler3D monkAgx_lut3d_1Sampler;

// Declaration of the OCIO shader function

vec4 monkAgxDisplay(vec4 inPixel)
{
  vec4 outColor = inPixel;
  
  // Add Matrix processing
  
  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    vec4 tmp = res;
    res = mat4(0.55946304732768604, 0.076233260873370345, 0.065537509515292691, 0., 0.30477581102833667, 0.78795239521844862, 0.16454272987167434, 0., 0.1358129414038276, 0.13577484882875845, 0.76974152768747039, 0., 0., 0., 0., 1.) * tmp;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }
  
  // Add Log processing
  
  {
    outColor.rgb = max( vec3(1.17549435e-38, 1.17549435e-38, 1.17549435e-38), outColor.rgb);
    outColor.rgb = log2(outColor.rgb);
  }
  
  // Add Matrix processing
  
  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    res = vec4(0.0400000028, 0.0400000028, 0.0400000028, 1.) * res;
    res = vec4(0.498957247, 0.498957247, 0.498957247, 0.) + res;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }
  
  // Add LUT 3D processing for monkAgx_lut3d_0
  
  {
    vec3 coords = outColor.rgb * vec3(36., 36., 36.); 
    vec3 baseInd = floor(coords);
    vec3 frac = coords - baseInd;
    vec3 f1, f4;
    baseInd = ( baseInd.zyx + vec3(0.5, 0.5, 0.5) ) / vec3(37., 37., 37.);
    vec3 v1 = texture(monkAgx_lut3d_0Sampler, baseInd).rgb;
    vec3 nextInd = baseInd + vec3(0.0270270277, 0.0270270277, 0.0270270277);
    vec3 v4 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
    if (frac.r >= frac.g)
    {
      if (frac.g >= frac.b)
      {
        nextInd = baseInd + vec3(0., 0., 0.0270270277);
        vec3 v2 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0., 0.0270270277, 0.0270270277);
        vec3 v3 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.r, 1. - frac.r, 1. - frac.r);
        f4 = vec3(frac.b, frac.b, frac.b);
        vec3 f2 = vec3(frac.r - frac.g, frac.r - frac.g, frac.r - frac.g);
        vec3 f3 = vec3(frac.g - frac.b, frac.g - frac.b, frac.g - frac.b);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else if (frac.r >= frac.b)
      {
        nextInd = baseInd + vec3(0., 0., 0.0270270277);
        vec3 v2 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0270270277, 0., 0.0270270277);
        vec3 v3 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.r, 1. - frac.r, 1. - frac.r);
        f4 = vec3(frac.g, frac.g, frac.g);
        vec3 f2 = vec3(frac.r - frac.b, frac.r - frac.b, frac.r - frac.b);
        vec3 f3 = vec3(frac.b - frac.g, frac.b - frac.g, frac.b - frac.g);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else
      {
        nextInd = baseInd + vec3(0.0270270277, 0., 0.);
        vec3 v2 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0270270277, 0., 0.0270270277);
        vec3 v3 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.b, 1. - frac.b, 1. - frac.b);
        f4 = vec3(frac.g, frac.g, frac.g);
        vec3 f2 = vec3(frac.b - frac.r, frac.b - frac.r, frac.b - frac.r);
        vec3 f3 = vec3(frac.r - frac.g, frac.r - frac.g, frac.r - frac.g);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
    }
    else
    {
      if (frac.g <= frac.b)
      {
        nextInd = baseInd + vec3(0.0270270277, 0., 0.);
        vec3 v2 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0270270277, 0.0270270277, 0.);
        vec3 v3 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.b, 1. - frac.b, 1. - frac.b);
        f4 = vec3(frac.r, frac.r, frac.r);
        vec3 f2 = vec3(frac.b - frac.g, frac.b - frac.g, frac.b - frac.g);
        vec3 f3 = vec3(frac.g - frac.r, frac.g - frac.r, frac.g - frac.r);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else if (frac.r >= frac.b)
      {
        nextInd = baseInd + vec3(0., 0.0270270277, 0.);
        vec3 v2 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0., 0.0270270277, 0.0270270277);
        vec3 v3 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.g, 1. - frac.g, 1. - frac.g);
        f4 = vec3(frac.b, frac.b, frac.b);
        vec3 f2 = vec3(frac.g - frac.r, frac.g - frac.r, frac.g - frac.r);
        vec3 f3 = vec3(frac.r - frac.b, frac.r - frac.b, frac.r - frac.b);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else
      {
        nextInd = baseInd + vec3(0., 0.0270270277, 0.);
        vec3 v2 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0270270277, 0.0270270277, 0.);
        vec3 v3 = texture(monkAgx_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.g, 1. - frac.g, 1. - frac.g);
        f4 = vec3(frac.r, frac.r, frac.r);
        vec3 f2 = vec3(frac.g - frac.b, frac.g - frac.b, frac.g - frac.b);
        vec3 f3 = vec3(frac.b - frac.r, frac.b - frac.r, frac.b - frac.r);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
    }
    outColor.rgb = outColor.rgb + (f1 * v1) + (f4 * v4);
  }
  
  // Add Matrix processing
  
  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    res = vec4(25., 25., 25., 1.) * res;
    res = vec4(-12.4739304, -12.4739304, -12.4739304, -0.) + res;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }
  
  // Add Log 'Anti-Log' processing
  
  {
    outColor.rgb = pow( vec3(2., 2., 2.), outColor.rgb);
  }
  
  // Add Matrix processing
  
  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    vec4 tmp = res;
    res = mat4(0.96797780550090085, 0.13180996650086257, 0.046867767756390941, 0., 0.11788761763487138, 0.91606228485405561, 0.012419106553223896, 0., -0.085853637069560396, -0.047868187965286801, 0.94083341200819648, 0., 0., 0., 0., 1.) * tmp;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }
  
  // Add Log processing
  
  {
    outColor.rgb = max( vec3(1.17549435e-38, 1.17549435e-38, 1.17549435e-38), outColor.rgb);
    outColor.rgb = log2(outColor.rgb);
  }
  
  // Add Matrix processing
  
  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    res = vec4(0.0400000028, 0.0400000028, 0.0400000028, 1.) * res;
    res = vec4(0.498957247, 0.498957247, 0.498957247, 0.) + res;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }
  
  // Add GradingPrimary 'log' forward processing
  
  {
    vec3 brightness = vec3(0., 0., 0.);
    vec3 contrast = vec3(1.20000005, 1.20000005, 1.20000005);
    vec3 gamma = vec3(1., 1., 1.);
    const float pivot = 0.400000006;
    const float pivotBlack = 0.;
    const float pivotWhite = 1.;
    const float clampBlack = -3.40282347e+38;
    const float clampWhite = 3.40282347e+38;
    const float saturation = 1.;
    outColor.rgb += brightness;
    outColor.rgb = ( outColor.rgb - pivot ) * contrast + pivot;
    if ( gamma != vec3(1., 1., 1.) )
    {
      vec3 normalizedOut = abs(outColor.rgb - pivotBlack) / (pivotWhite - pivotBlack);
      vec3 scale = sign(outColor.rgb - pivotBlack) * (pivotWhite - pivotBlack);
      outColor.rgb = pow( normalizedOut, gamma ) * scale + pivotBlack;
    }
    vec3 lumaWgts = vec3(0.212599993, 0.715200007, 0.0722000003);
    float luma = dot( outColor.rgb, lumaWgts );
    outColor.rgb = luma + saturation * (outColor.rgb - luma);
    outColor.rgb = clamp( outColor.rgb, clampBlack, clampWhite );
  }
  
  // Add Matrix processing
  
  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    res = vec4(25., 25., 25., 1.) * res;
    res = vec4(-12.4739304, -12.4739304, -12.4739304, -0.) + res;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }
  
  // Add Log 'Anti-Log' processing
  
  {
    outColor.rgb = pow( vec3(2., 2., 2.), outColor.rgb);
  }
  
  // Add Matrix processing
  
  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    vec4 tmp = res;
    res = mat4(1.0473055429258675, -0.15331468291968839, -0.050147923075744338, 0., -0.1359790976104826, 1.1107823154345289, -0.0078886305179622848, 0., 0.088651100093797508, 0.042524545799789537, 1.0579099246056205, 0., 0., 0., 0., 1.) * tmp;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }
  
  // Add Log processing
  
  {
    outColor.rgb = max( vec3(1.17549435e-38, 1.17549435e-38, 1.17549435e-38), outColor.rgb);
    outColor.rgb = log2(outColor.rgb);
  }
  
  // Add Matrix processing
  
  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    res = vec4(0.0400000028, 0.0400000028, 0.0400000028, 1.) * res;
    res = vec4(0.498957247, 0.498957247, 0.498957247, 0.) + res;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }
  
  // Add LUT 3D processing for monkAgx_lut3d_1
  
  {
    vec3 coords = outColor.rgb * vec3(56., 56., 56.); 
    vec3 baseInd = floor(coords);
    vec3 frac = coords - baseInd;
    vec3 f1, f4;
    baseInd = ( baseInd.zyx + vec3(0.5, 0.5, 0.5) ) / vec3(57., 57., 57.);
    vec3 v1 = texture(monkAgx_lut3d_1Sampler, baseInd).rgb;
    vec3 nextInd = baseInd + vec3(0.0175438598, 0.0175438598, 0.0175438598);
    vec3 v4 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
    if (frac.r >= frac.g)
    {
      if (frac.g >= frac.b)
      {
        nextInd = baseInd + vec3(0., 0., 0.0175438598);
        vec3 v2 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0., 0.0175438598, 0.0175438598);
        vec3 v3 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.r, 1. - frac.r, 1. - frac.r);
        f4 = vec3(frac.b, frac.b, frac.b);
        vec3 f2 = vec3(frac.r - frac.g, frac.r - frac.g, frac.r - frac.g);
        vec3 f3 = vec3(frac.g - frac.b, frac.g - frac.b, frac.g - frac.b);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else if (frac.r >= frac.b)
      {
        nextInd = baseInd + vec3(0., 0., 0.0175438598);
        vec3 v2 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0175438598, 0., 0.0175438598);
        vec3 v3 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.r, 1. - frac.r, 1. - frac.r);
        f4 = vec3(frac.g, frac.g, frac.g);
        vec3 f2 = vec3(frac.r - frac.b, frac.r - frac.b, frac.r - frac.b);
        vec3 f3 = vec3(frac.b - frac.g, frac.b - frac.g, frac.b - frac.g);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else
      {
        nextInd = baseInd + vec3(0.0175438598, 0., 0.);
        vec3 v2 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0175438598, 0., 0.0175438598);
        vec3 v3 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.b, 1. - frac.b, 1. - frac.b);
        f4 = vec3(frac.g, frac.g, frac.g);
        vec3 f2 = vec3(frac.b - frac.r, frac.b - frac.r, frac.b - frac.r);
        vec3 f3 = vec3(frac.r - frac.g, frac.r - frac.g, frac.r - frac.g);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
    }
    else
    {
      if (frac.g <= frac.b)
      {
        nextInd = baseInd + vec3(0.0175438598, 0., 0.);
        vec3 v2 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0175438598, 0.0175438598, 0.);
        vec3 v3 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.b, 1. - frac.b, 1. - frac.b);
        f4 = vec3(frac.r, frac.r, frac.r);
        vec3 f2 = vec3(frac.b - frac.g, frac.b - frac.g, frac.b - frac.g);
        vec3 f3 = vec3(frac.g - frac.r, frac.g - frac.r, frac.g - frac.r);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else if (frac.r >= frac.b)
      {
        nextInd = baseInd + vec3(0., 0.0175438598, 0.);
        vec3 v2 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0., 0.0175438598, 0.0175438598);
        vec3 v3 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.g, 1. - frac.g, 1. - frac.g);
        f4 = vec3(frac.b, frac.b, frac.b);
        vec3 f2 = vec3(frac.g - frac.r, frac.g - frac.r, frac.g - frac.r);
        vec3 f3 = vec3(frac.r - frac.b, frac.r - frac.b, frac.r - frac.b);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else
      {
        nextInd = baseInd + vec3(0., 0.0175438598, 0.);
        vec3 v2 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0175438598, 0.0175438598, 0.);
        vec3 v3 = texture(monkAgx_lut3d_1Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.g, 1. - frac.g, 1. - frac.g);
        f4 = vec3(frac.r, frac.r, frac.r);
        vec3 f2 = vec3(frac.g - frac.b, frac.g - frac.b, frac.g - frac.b);
        vec3 f3 = vec3(frac.b - frac.r, frac.b - frac.r, frac.b - frac.r);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
    }
    outColor.rgb = outColor.rgb + (f1 * v1) + (f4 * v4);
  }
  
  // Add Gamma 'basicFwd' processing
  
  {
    vec4 gamma = vec4(2.3999999999999999, 2.3999999999999999, 2.3999999999999999, 1.);
    vec4 res = pow( max( vec4(0., 0., 0., 0.), outColor ), gamma );
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }

  return outColor;
}
