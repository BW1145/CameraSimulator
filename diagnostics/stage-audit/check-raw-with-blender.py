"""Independent EXR decoder cross-check, no scene loaded or render performed.
blender --background --factory-startup --python this.py -- source.exr output.json
"""
import bpy,sys,json,hashlib,pathlib,numpy as np
args=sys.argv[sys.argv.index('--')+1:]
source,out=map(pathlib.Path,args)
image=bpy.data.images.load(str(source),check_existing=False)
w,h=image.size
pixels=np.empty(w*h*4,dtype=np.float32)
image.pixels.foreach_get(pixels)
top=pixels.reshape(h,w,4)[::-1,:,:].copy()
rgb=top[:,:,:3]
# Float64 arithmetic + half-up integer rounding matches the defined JS packer.
codes=np.floor(np.clip((np.log2(np.maximum(rgb.astype(np.float64),2**-16))+16)/24*255,0,255)+.5).astype(np.uint8)
result={'method':'Blender image loader, factory-empty scene, no render, independent of JavaScript EXRLoader. Top-left RGBA float32 and independently quantized RGB code hashes.', 'blenderVersion':bpy.app.version_string,'file':source.name,'imageColorSpace':image.colorspace_settings.name,'dimensions':[w,h],'rgbaFloat32LETopLeftSHA256':hashlib.sha256(top.astype('<f4').tobytes()).hexdigest(),'logMin16Max8RGBUint8SHA256':hashlib.sha256(codes.tobytes()).hexdigest(),'minimumRGB':rgb.min((0,1)).astype(float).tolist(),'maximumRGB':rgb.max((0,1)).astype(float).tolist(),'meanRGB':rgb.astype(np.float64).mean((0,1)).tolist(),'nonfiniteChannels':int((~np.isfinite(rgb)).sum())}
out.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
