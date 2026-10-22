"""Carry source image/ramp transparency into glTF cutout materials."""
import argparse,bpy,hashlib,json,pathlib,sys
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--work',required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);work=pathlib.Path(a.work).resolve()
report=json.loads((work/'bake.json').read_text(encoding='utf-8'));report['opacityMaps']={}
if hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest()!=report['sourceSha256']:raise ValueError('Opacity source differs from surface bake')
for material in bpy.data.materials:
 if not material.use_nodes:continue
 output=next((n for n in material.node_tree.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output),None)
 if not output or not output.inputs['Surface'].is_linked:continue
 mix=output.inputs['Surface'].links[0].from_node
 if mix.type!='MIX_SHADER' or not all(s.is_linked for s in mix.inputs):continue
 shaders=[s.links[0].from_node for s in mix.inputs[1:]]
 if {n.type for n in shaders}!={'BSDF_TRANSPARENT','BSDF_DIFFUSE'}:continue
 ramp=mix.inputs[0].links[0].from_node
 if ramp.type!='VALTORGB' or not ramp.inputs[0].is_linked:continue
 texture=ramp.inputs[0].links[0].from_node
 if texture.type!='TEX_IMAGE' or not texture.image:continue
 if ramp.color_ramp.color_mode!='RGB' or ramp.color_ramp.interpolation not in {'LINEAR','EASE','CONSTANT'}:raise ValueError('Unsupported opacity ramp: '+material.name)
 image=texture.image;w,h=image.size;pixels=np.empty(w*h*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(-1,4)
 value=pixels[:,:3]@np.array([.2126,.7152,.0722]);stops=list(ramp.color_ramp.elements);result=np.zeros(len(value),dtype=np.float32)
 for i in range(len(stops)-1):
  left,right=stops[i:i+2];t=np.clip((value-left.position)/max(1e-8,right.position-left.position),0,1)
  if ramp.color_ramp.interpolation=='EASE':t=t*t*(3-2*t)
  if ramp.color_ramp.interpolation=='CONSTANT':t=(value>=right.position).astype(np.float32)
  lo=np.dot(left.color[:3],[.2126,.7152,.0722]);hi=np.dot(right.color[:3],[.2126,.7152,.0722])
  if i==0:result.fill(lo)
  result+=(hi-lo)*t
 alpha=1-result if shaders[1].type=='BSDF_TRANSPARENT' else result
 rgba=np.ones((w*h,4),dtype=np.float32);rgba[:,3]=np.clip(alpha,0,1)
 name='opacity-'+str(len(report['opacityMaps']))+'.png';mask=bpy.data.images.new(name,width=w,height=h,alpha=True);mask.pixels.foreach_set(rgba.reshape(-1));mask.file_format='PNG';mask.filepath_raw=str(work/name);mask.save()
 diffuse=next(n for n in shaders if n.type=='BSDF_DIFFUSE')
 report['opacityMaps'][material.name+'-web']={'file':name,'color':list(diffuse.inputs['Color'].default_value),'sourceImage':image.name}
 print('SOURCE_OPACITY',material.name,image.name,w,h,flush=True)
(work/'bake.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
