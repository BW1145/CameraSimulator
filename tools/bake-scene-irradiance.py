"""Sample diffuse incident room light with the original source scene intact."""
import argparse,bpy,hashlib,json,pathlib,sys,time,runpy
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--work',required=True);p.add_argument('--size',type=int,default=2048);p.add_argument('--samples',type=int,default=64);p.add_argument('--preview',action='store_true');p.add_argument('--offset',type=float,default=.01)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);work=pathlib.Path(a.work).resolve();meta=json.loads((work/'targets.json').read_text(encoding='utf-8'))
if hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest()!=meta['sourceSha256']:raise ValueError('Source hash differs from the target geometry')
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=a.samples
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='CUDA';prefs.get_devices()
 for device in prefs.devices:device.use=device.type=='CUDA'
 if any(device.use for device in prefs.devices):s.cycles.device='GPU'
except Exception:s.cycles.device='CPU'
positions=np.fromfile(work/'positions.bin',dtype=np.float32).reshape(-1,3);normals=np.fromfile(work/'normals.bin',dtype=np.float32).reshape(-1,3)
valid=np.fromfile(work/'valid.bin',dtype=np.bool_);mapped=np.fromfile(work/'uv.bin',dtype=np.float32).reshape(-1,3,2)
triangles=np.arange(len(positions),dtype=np.uint32).reshape(-1,3)[valid].copy();uv=mapped[valid].copy();v=positions[triangles]
flip=np.einsum('ij,ij->i',np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]),normals[triangles].mean(axis=1))<0
triangles[flip]=triangles[flip][:,[0,2,1]];uv[flip]=uv[flip][:,[0,2,1]]
# Lift the white receiving surface clear of quantization and simplification
# error; it does not cast shadows or replace any original source surface.
mesh=bpy.data.meshes.new('RoomIrradianceReceiver');mesh.from_pydata((positions+normals*a.offset).tolist(),[],triangles.tolist());mesh.update()
mesh.polygons.foreach_set('use_smooth',np.ones(len(mesh.polygons),dtype=np.bool_));mesh.normals_split_custom_set_from_vertices(normals.tolist())
layer=mesh.uv_layers.new(name='SourceBakeUV');layer.data.foreach_set('uv',uv.reshape(-1));mesh.uv_layers.active=layer;layer.active_render=True
target=bpy.data.objects.new('RoomIrradianceReceiver',mesh);s.collection.objects.link(target)
for ray in ['diffuse','glossy','transmission','shadow','volume_scatter']:setattr(target,'visible_'+ray,False)
material=bpy.data.materials.new('WhiteIrradianceReceiver');material.use_nodes=True;nodes=material.node_tree.nodes;nodes.clear()
diffuse=nodes.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Color'].default_value=(1,1,1,1);output=nodes.new('ShaderNodeOutputMaterial');material.node_tree.links.new(diffuse.outputs[0],output.inputs['Surface']);mesh.materials.append(material)
if a.preview:
 nodes.clear();albedo=nodes.new('ShaderNodeTexImage');albedo.image=bpy.data.images.load(str(work/'albedo.png'));light=nodes.new('ShaderNodeTexImage');light.image=bpy.data.images.load(str(work/'irradiance.hdr'));light.image.colorspace_settings.name='Non-Color'
 multiply=nodes.new('ShaderNodeVectorMath');multiply.operation='MULTIPLY';material.node_tree.links.new(albedo.outputs['Color'],multiply.inputs[0]);material.node_tree.links.new(light.outputs['Color'],multiply.inputs[1]);emission=nodes.new('ShaderNodeEmission');material.node_tree.links.new(multiply.outputs[0],emission.inputs['Color']);output=nodes.new('ShaderNodeOutputMaterial');material.node_tree.links.new(emission.outputs[0],output.inputs['Surface'])
 sys.argv=['capture-scene-pack.py','--','--output',str(work/'mapped-reference'),'--preview','--width','1280','--samples','32'];runpy.run_path(str(pathlib.Path(__file__).with_name('capture-scene-pack.py')),run_name='__main__');raise SystemExit
image=bpy.data.images.new('RoomIrradiance',width=a.size,height=a.size,alpha=False,float_buffer=True);image.colorspace_settings.name='Non-Color';texture=nodes.new('ShaderNodeTexImage');texture.image=image;nodes.active=texture
bpy.ops.object.select_all(action='DESELECT');target.select_set(True);bpy.context.view_layer.objects.active=target
started=time.monotonic();print('IRRADIANCE_START',a.size,a.samples,flush=True)
bpy.ops.object.bake(type='DIFFUSE',pass_filter={'DIRECT','INDIRECT'},use_selected_to_active=False,margin=1,use_clear=True)
image.filepath_raw=str(work/'irradiance.hdr');image.file_format='HDR';image.save()
report=json.loads((work/'bake.json').read_text(encoding='utf-8'));report['maps']['irradiance']={'width':a.size,'samples':a.samples,'seconds':round(time.monotonic()-started,2),'offset':a.offset,'method':'White diffuse receiver above delivered geometry; original source shaders, lights, geometry and ray visibility retained'}
(work/'bake.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('IRRADIANCE_DONE',report['maps']['irradiance'],flush=True)
