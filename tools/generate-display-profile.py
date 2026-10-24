#!/usr/bin/env python3
"""Export the pinned Blender AgX display operations, not an approximate baked fit.

Use Blender 4.5.14's bundled Python (contains PyOpenColorIO 2.4.1). No bpy,
rendering, scene files, external network, or app modifications are involved.
"""
import argparse
import array
import hashlib
import itertools
import json
import math
from pathlib import Path
import random
import struct
import sys

import PyOpenColorIO as ocio

PROFILE_ID = 'blender-4.5.14-agx-medium-high-v1'
LOOK = 'AgX - Medium High Contrast'
CONFIG_SHA = 'aa4142b29b5a472aa5cb895020aa8cb673c95a31660eeee451f8a820694d3b16'
SOURCE_PINS = {
    'luts/AgX_Base_sRGB.cube': 'e707a36f3e90ee79bc342332febf91334c02ce3974cac700ece00ca9d4507491',
    'luts/luminance_compensation_bt2020.cube': 'e3f5adcd8c08f77a96be141e8d504d58125cc80216a7a641abc970c85840cfd2',
    'luts/xyz_E_to_D65.spimtx': '24c1d78b42022f9a996b0f568b3fd6ceadb70a41e58520bc720fd618559c5301',
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def file_record(path):
    return dict(file=path.name, bytes=path.stat().st_size, sha256=sha(path))


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, allow_nan=False) + '\n')


def processors(config):
    # Same API composition as Blender 4.5's display processor. For this one
    # explicitly pinned look the result/process color space is AgX Log.
    result_space = config.getLook(LOOK).getProcessSpace()
    assert result_space == 'AgX Log'
    look = ocio.LookTransform(src='Linear Rec.709', dst=result_space, looks=LOOK)
    display = ocio.DisplayViewTransform(src=result_space, display='sRGB',
                                       view='AgX', looksBypass=True)
    display_group = ocio.GroupTransform([look, display])
    linear_group = ocio.GroupTransform([
        look, display, ocio.ColorSpaceTransform(src='sRGB', dst='Linear Rec.709')])
    return config.getProcessor(linear_group), config.getProcessor(display_group)


def encode_srgb(v):
    return 12.92 * v if v <= .0031308 else 1.055 * v ** (1 / 2.4) - .055


def make_cases(cpu, display_cpu):
    cases = []
    def add(name, rgb, **extras):
        linear = cpu.applyRGB(rgb)
        srgb = display_cpu.applyRGB(rgb)
        assert all(math.isfinite(x) for x in linear + srgb)
        error = max(abs(encode_srgb(max(0, a)) - b) for a, b in zip(linear, srgb))
        assert error < 2e-5, (name, error)
        cases.append(dict(name=name, input=rgb, expectedLinear=linear,
                          expectedSRGB=srgb, **extras))
    # Include black, small signed inputs, toe/shoulder/extreme HDR, saturated
    # primaries and enough off-grid values to catch channel/layout mistakes.
    for ev in range(-24, 27):
        x=.18 * 2 ** ev
        add(f'gray-{ev:+d}', [x, x, x])
    add('black', [0, 0, 0])
    add('signed-small', [-.001, .001, .02])
    levels = [0, 2 ** -16, .018, .18, 1, 8, 64, 4096]
    for index, rgb in enumerate(itertools.product(levels, repeat=3)):
        add(f'rgb-grid-{index}', list(rgb))
    rng=random.Random(450014)
    for i in range(128):
        add(f'hdr-off-grid-{i}', [2 ** rng.uniform(-20, 16) for _ in range(3)])
    # Dynamic photographic state is intentionally outside the generated profile.
    # These input values demonstrate the host's camera-exposure/WB/flash ordering.
    for ev, wb, flash in itertools.product([-8, -3, 0, 3, 8], [2500, 5000, 9000], [0, 1]):
        ambient=[.04, .18, 2.7]
        flash_rgb=[.8, .6, .4]
        shutter=.25
        flash_weight=flash * .01 / shutter
        temperature=(wb-5000) / 3000
        wb_gain=[math.exp(temperature*.32), 1, math.exp(-temperature*.32)]
        gain=2 ** (ev-1.5)
        rgb=[(a+f*flash_weight)*gain*w for a,f,w in zip(ambient,flash_rgb,wb_gain)]
        add(f'pipeline-ev{ev:+d}-wb{wb}-flash{flash}', rgb,
            host=dict(ambient=ambient, flash=flash_rgb, flashSetting=flash,
                      referenceDuration=.01, shutter=shutter,
                      photographicExposureEV=ev, displayExposureEV=-1.5, wb=wb))
    return cases


def load_transport_reference(path=None):
    path = path or Path(__file__).resolve().parent/'generated/transport-decoder-reference.json'
    reference = json.loads(Path(path).read_text())
    assert reference['threeVersion'] == '0.186.1'
    assert reference['decoder']['sha256'] == '50bd534f57d3cb643b7b89cb32b13a02b7059b2e7b03a0db63e70d0b3c066d02'
    assert reference['dataUtils']['sha256'] == 'c13af55f853b7882c7435d06b9c66333e9d68b42b22f6c257a060d6248052d6b'
    assert (reference['min'], reference['max']) == (-16, 6)
    assert [v['code'] for v in reference['values']] == list(range(256))
    for value in reference['values']:
        # Decode the exact bits captured by Node from the app, not Python's
        # nearest-even conversion (Three 0.186.1 truncates the mantissa).
        assert value['linear'] == struct.unpack('<e', struct.pack('<H', value['halfBits']))[0]
    return reference


def make_transport_cases(cpu, display_cpu, reference=None):
    reference = reference or load_transport_reference()
    gray_codes=[0,16,32,48,64,80,96,112,128,144,160,176,192,208,224,240,255]
    codes=[[c,c,c] for c in gray_codes]
    codes += [[a,b,c] for a,b,c in (
        (255,0,0),(0,255,0),(0,0,255),(255,255,0),(0,255,255),(255,0,255),
        (200,150,100),(100,200,150),(150,100,200),(40,80,120),(180,190,200),
        (230,250,210),(13,217,151),(250,80,180),(82,143,239))]
    variants=[dict(cameraEVOffset=ev,wb=wb) for ev,wb in
              [(0,5000),(2,5000),(-2,5000),(0,2500),(0,9000)]]
    cases=[]
    for i,code in enumerate(codes):
        decoded=[reference['values'][x]['decoded'] for x in code]
        linear=[reference['values'][x]['linear'] for x in code]
        samples=[]
        for variant in variants:
            temperature=(variant['wb']-5000)/3000
            wbg=[math.exp(temperature*.32),1,math.exp(-temperature*.32)]
            camera=[x*2**variant['cameraEVOffset']*w for x,w in zip(linear,wbg)]
            profile_input=[x*2**-1.5 for x in camera]
            display_linear=cpu.applyRGB(profile_input)
            srgb=display_cpu.applyRGB(profile_input)
            samples.append(dict(**variant,displayExposureEV=-1.5,
                afterCameraExposureAndWB=camera,input=profile_input,
                expectedDisplayLinear=display_linear,expectedSRGB=srgb,
                expectedRGB8=[round(max(0,min(1,x))*255) for x in srgb]))
        cases.append(dict(name=f'log-rgb8-{i}',code=code,decodedRGB=decoded,
                          linearRGB=linear,variants=samples))
    return cases


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--transport-reference', type=Path,
        help='Node capture from capture-transport-reference.mjs; defaults to generated/ sibling')
    args=parser.parse_args()
    config_path=args.config.resolve()
    assert ocio.__version__ == '2.4.1', ocio.__version__
    assert sha(config_path) == CONFIG_SHA
    for name, digest in SOURCE_PINS.items():
        assert sha(config_path.parent/name) == digest, name
    config=ocio.Config.CreateFromFile(str(config_path))
    processor, display_processor=processors(config)
    actual_sources={Path(p).relative_to(config_path.parent).as_posix():sha(p)
                    for p in processor.getProcessorMetadata().getFiles()}
    assert actual_sources == SOURCE_PINS
    assert list(processor.getProcessorMetadata().getLooks()) == [LOOK]
    gpu=processor.getDefaultGPUProcessor()
    desc=ocio.GpuShaderDesc.CreateShaderDesc(
        language=ocio.GPU_LANGUAGE_GLSL_ES_3_0,
        functionName='monkAgxDisplay', resourcePrefix='monkAgx')
    desc.setAllowTexture1D(False)
    gpu.extractGpuShaderInfo(desc)
    assert not list(desc.getTextures()) and not list(desc.getUniforms())
    shader=desc.getShaderText()
    # WebGL ES needs explicit high precision for sampler3D declarations. This
    # annotation does not change the generated numerical operations.
    shader=shader.replace('uniform sampler3D ', 'uniform highp sampler3D ')
    out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
    shader_path=out/'shader.glsl';shader_path.write_text(shader)
    luts=[]
    for i, tex in enumerate(desc.get3DTextures()):
        assert tex.interpolation == ocio.INTERP_NEAREST
        data=array.array('f',tex.getValues())
        assert data.itemsize == 4 and len(data) == tex.edgeLen**3*3
        assert all(math.isfinite(x) for x in data)
        if sys.byteorder != 'little':data.byteswap()
        path=out/f'lut-{i}.bin';path.write_bytes(data.tobytes())
        luts.append(dict(**file_record(path), edge=tex.edgeLen,
                         sampler=tex.samplerName, texture=tex.textureName,
                         storage='float32-le', channels=3, channelOrder='RGB',
                         layout='x-fastest; blue-lattice-index fastest; RGB interleaved; OCIO order unchanged',
                         interpolation='nearest', shaderInterpolation='tetrahedral',
                         wrap='clamp-to-edge', mipmaps=False, flipY=False,
                         colorSpace='none'))
    assert [x['edge'] for x in luts] == [37,57]
    cpu=processor.getDefaultCPUProcessor()
    display_cpu=display_processor.getDefaultCPUProcessor()
    cases=make_cases(cpu, display_cpu)
    reference_path=args.transport_reference or Path(__file__).resolve().parent/'generated/transport-decoder-reference.json'
    reference=load_transport_reference(reference_path)
    transport_cases=make_transport_cases(cpu,display_cpu,reference)
    fixtures=out/'cpu-vectors.json'
    write_json(fixtures,dict(version=1,profile=PROFILE_ID,ocioVersion=ocio.__version__,
        processorCacheId=processor.getCacheID(),inputSpace='scene-linear Rec.709',
        outputSpace='display-linear Rec.709',displayExposureBaked=False,
        note='Generated from the pinned OCIO CPU processor; GPU verification is a separate required test.',
        suggestedAbsoluteLinearTolerance=.0002,suggestedSRGBTolerance=.0002,cases=cases,
        transportEncoding=dict(type='log2-rgb8',min=-16,max=6,
            decodedStorage=reference['conversion'],
            decoderReference=file_record(reference_path),threeVersion=reference['threeVersion'],
            decoder=reference['decoder'],dataUtils=reference['dataUtils'],
            expectedDisplayStorage='sRGB UNORM8; allow one code for rounding'),
        transportCases=transport_cases))
    profile=dict(version=1,id=PROFILE_ID,functionName='monkAgxDisplay',
        shader=dict(**file_record(shader_path),language='GLSL ES 3.0',
                    generator='OCIO generic GPU processor, not an approximate baked 3D fit'),
        luts=luts,inputSpace='scene-linear Rec.709',outputSpace='display-linear Rec.709',
        view='AgX',look=LOOK,display='sRGB',gamma=1,displayExposureBaked=False,
        requiredHostTransfer='Apply the normal sRGB transfer exactly once after this function.',
        requiredHostOrder=['HDR ambient/flash/subject composite', 'photographic exposure',
                           'white balance', 'displayExposureEV', 'monkAgxDisplay',
                           'sRGB transfer', 'existing noise/overlays'],
        provenance=dict(blenderVersion='4.5.14 LTS',ocioVersion=ocio.__version__,
            configSha256=CONFIG_SHA,sourceResources=SOURCE_PINS,
            generatorSha256=sha(__file__),processorCacheId=processor.getCacheID(),
            gpuProcessorCacheId=gpu.getCacheID(),gpuShaderCacheId=desc.getCacheID(),
            sourceConfig='Blender release/datafiles/colormanagement/config.ocio',
            blenderCompositionReference='https://github.com/blender/blender/blob/v4.5.3/source/blender/imbuf/opencolorio/intern/libocio/libocio_display_processor.cc'),
        referenceFixtures=file_record(fixtures),transportDecoderReference=file_record(reference_path))
    write_json(out/'profile.json',profile)
    write_json(out/'generation-receipt.json',dict(status='generated-cpu-validated-gpu-not-yet-run',
        profile=file_record(out/'profile.json'),shader=file_record(shader_path),luts=luts,
        fixtures=file_record(fixtures),cases=len(cases),transportCases=len(transport_cases),
        transportVariants=5,totalLutBytes=sum(t['bytes'] for t in luts)))
    print(json.dumps(dict(status='generated',id=PROFILE_ID,cases=len(cases),
        luts=[dict(edge=t['edge'],bytes=t['bytes'],sha256=t['sha256']) for t in luts],
        shaderSha256=sha(shader_path),profileSha256=sha(out/'profile.json'))))


if __name__=='__main__':
    main()
