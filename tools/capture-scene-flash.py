"""Render isolated camera-flash radiance using a Cycles light group.

The original .blend is read only. All original lamps/materials stay enabled;
Combined_CameraFlash contains only paths originating at this added lamp.
"""
import argparse,bpy,hashlib,json,pathlib,sys,time
from mathutils import Matrix,Vector
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from scene_capture_setup import apply_derivations
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--camera',required=True);p.add_argument('--width',type=int,default=2560);p.add_argument('--samples',type=int,default=32);p.add_argument('--energy',type=float,default=1000);p.add_argument('--reuse',action='store_true');p.add_argument('--views',default='center,left,right,up,down,front,back');p.add_argument('--flash-forward',type=float,default=0)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
source_sha=hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest()
s=bpy.context.scene;source_camera=bpy.data.objects[a.camera];position,rotation,scale=source_camera.matrix_world.decompose();native=Matrix.LocRotScale(position,rotation,Vector((1,1,1)))
cam=bpy.data.objects.new('PhotographicCaptureCamera',source_camera.data.copy());cam.data.animation_data_clear();s.collection.objects.link(cam);s.camera=cam
source_pack=None
if (out/'viewfield.json').exists():
 source_pack=json.loads((out/'viewfield.json').read_text(encoding='utf8'));cam.data.type='PERSP';cam.data.lens=source_pack['camera']['lens'];cam.data.clip_end=source_pack['camera']['far'];apply_derivations(source_pack.get('derivations',[]))
 if source_pack['sourceSha256']!=source_sha:raise ValueError('Flash source blend does not match ambient captures')
 native=Matrix(source_pack['camera']['matrix']);rotation=native.to_quaternion()
elif cam.data.type!='PERSP':raise ValueError('Orthographic flash requires matching perspective viewfield.json')
lens=cam.data.lens;cam.data.lens=lens/1.2;cam.data.dof.use_dof=False
for marker in s.timeline_markers:marker.camera=None
aspect=s.render.resolution_x/s.render.resolution_y;s.render.use_persistent_data=True;s.render.engine='CYCLES';s.cycles.samples=a.samples;s.cycles.use_denoising=False;s.cycles.seed=17
s.render.resolution_x=a.width;s.render.resolution_y=round(a.width/aspect);s.render.resolution_percentage=100;s.render.use_compositing=True;s.render.use_sequencer=False
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='CUDA';prefs.get_devices()
 for d in prefs.devices:d.use=d.type!='CPU'
 if any(d.type!='CPU' for d in prefs.devices):s.cycles.device='GPU'
except Exception:pass
layer=bpy.context.view_layer;group=layer.lightgroups.add(name='CameraFlash');layer.cycles.denoising_store_passes=True
lamp=bpy.data.lights.new('Photographic camera flash','AREA');lamp.energy=a.energy;lamp.shape='DISK';lamp.size=.08
flash=bpy.data.objects.new('Photographic camera flash',lamp);s.collection.objects.link(flash);flash.lightgroup=group.name
s.use_nodes=True;nodes=s.node_tree.nodes;nodes.clear();layers=nodes.new('CompositorNodeRLayers');layers.layer=layer.name
noise=nodes.new('CompositorNodeDenoise');s.node_tree.links.new(layers.outputs['Combined_'+group.name],noise.inputs['Image'])
for target,source in [('Normal','Denoising Normal'),('Albedo','Denoising Albedo')]:
 if source in layers.outputs:s.node_tree.links.new(layers.outputs[source],noise.inputs[target])
output=nodes.new('CompositorNodeOutputFile');output.base_path=str(out);output.format.file_format='OPEN_EXR';output.format.color_depth='32';output.format.color_mode='RGB';output.format.exr_codec='ZIP';s.node_tree.links.new(noise.outputs['Image'],output.inputs[0])
views=[]
conversion=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
offsets=[('center',(0,0,0)),('left',(-.3,0,0)),('right',(.3,0,0)),('up',(0,.2,0)),('down',(0,-.2,0)),('front',(0,0,-.3)),('back',(0,0,.3))]
capture_nears={}
if (out/'viewfield.json').exists():
 offsets=[(v['id'],v['offset']) for v in source_pack['views']];capture_nears={v['id']:v.get('near',source_pack['camera']['near']) for v in source_pack['views']}
for name,offset in offsets:
 if name not in a.views.split(','):continue
 if name in capture_nears:cam.data.clip_start=capture_nears[name]
 file=out/(name+'-flash.exr');started=time.monotonic()
 # Build both transforms directly. Reading matrix_world immediately after
 # assigning location can return the pre-depsgraph-update native transform.
 capture_matrix=native.copy();capture_matrix.translation=native.translation+rotation@Vector(offset);cam.matrix_world=capture_matrix
 flash_matrix=capture_matrix.copy();flash_matrix.translation+=rotation@Vector((0,0,-a.flash_forward));flash.matrix_world=flash_matrix;bpy.context.view_layer.update()
 if not(a.reuse and file.exists()):
  output.file_slots[0].path=name+'-flash';bpy.ops.render.render();source=out/(name+'-flash'+str(s.frame_current).zfill(4)+'.exr');source.replace(file)
 world_matrix=conversion@cam.matrix_world;actual_matrix=[world_matrix[r][c] for c in range(4) for r in range(4)]
 if source_pack:
  expected=next(v['cameraMatrix'] for v in source_pack['views'] if v['id']==name)
  if any(abs(actual_matrix[i]-expected[i])>2e-5 for i in range(16)):raise RuntimeError('Flash camera differs from ambient rig '+name)
 views.append({'id':name,'file':file.name,'offset':list(offset),'near':cam.data.clip_start,'cameraMatrix':actual_matrix,'flashPosition':[flash.location.x,flash.location.z,-flash.location.y],'bytes':file.stat().st_size,'seconds':round(time.monotonic()-started,2)})
 print('FLASH_CAPTURED',name,views[-1]['seconds'],views[-1]['bytes'],flush=True)
flash_report={'method':'Cycles isolated CameraFlash light group; denoised using source-scene auxiliary normals/albedo. No ambient subtraction.','sourceSha256':source_sha,'referenceEnergy':a.energy,'referenceDuration':.01,'areaDiameter':.08,'position':'actual capture camera origin plus explicit forward offset','coordinateSystem':'Three.js Y-up; source x,z,-y','originOffsetForward':a.flash_forward,'width':s.render.resolution_x,'height':s.render.resolution_y,'samples':a.samples,'views':views}
flash_path=out/'flash.json'
if flash_path.exists() and len(views)<7:
 previous=json.loads(flash_path.read_text(encoding='utf8'))
 if previous.get('originOffsetForward',0)==a.flash_forward and previous.get('referenceEnergy')==a.energy:
  merged={v['id']:v for v in previous['views']};merged.update({v['id']:v for v in views});flash_report['views']=[merged[name] for name,offset in offsets if name in merged]
flash_path.write_text(json.dumps(flash_report,indent=2)+'\n',encoding='utf8')








