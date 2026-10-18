"""Capture higher-resolution axial Z against an existing, immutable camera rig.

No radiance render. Original source .blend is never saved.
"""
import argparse,bpy,hashlib,json,pathlib,sys,time
from mathutils import Matrix,Vector
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from scene_capture_setup import apply_derivations
p=argparse.ArgumentParser();p.add_argument('--rig',required=True);p.add_argument('--output',required=True);p.add_argument('--camera',required=True);p.add_argument('--width',type=int,required=True);p.add_argument('--views',default='center,left,right,up,down,front,back');p.add_argument('--reuse',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);raw=json.loads(pathlib.Path(a.rig).read_text(encoding='utf8'));out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
sha=hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest()
if sha!=raw['sourceSha256']:raise ValueError('Depth source differs from camera rig')
s=bpy.context.scene;apply_derivations(raw.get('derivations',[]));source_camera=bpy.data.objects[a.camera]
cam=bpy.data.objects.new('HighResolutionDepthCamera',source_camera.data.copy());cam.data.animation_data_clear();cam.data.type='PERSP';cam.data.lens=raw['captureLens'];cam.data.sensor_width=raw['camera']['sensorWidth'];cam.data.clip_end=raw['camera']['far'];cam.data.dof.use_dof=False;s.collection.objects.link(cam);s.camera=cam
for marker in s.timeline_markers:marker.camera=None
native=Matrix(raw['camera']['matrix']);rotation=native.to_quaternion();conversion=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
s.render.engine='CYCLES';s.cycles.samples=1;s.cycles.use_denoising=False;s.render.use_persistent_data=True;s.render.use_sequencer=False;s.render.resolution_x=a.width;s.render.resolution_y=round(a.width/raw['camera']['aspect']);s.render.resolution_percentage=100
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='CUDA';prefs.get_devices()
 for d in prefs.devices:d.use=d.type!='CPU'
 if any(d.type!='CPU' for d in prefs.devices):s.cycles.device='GPU'
except Exception:pass
layer=bpy.context.view_layer;layer.use_pass_z=True;s.use_nodes=True;nodes=s.node_tree.nodes;nodes.clear();layers=nodes.new('CompositorNodeRLayers');layers.layer=layer.name
output=nodes.new('CompositorNodeOutputFile');output.base_path=str(out);output.format.file_format='OPEN_EXR';output.format.color_depth='32';output.format.color_mode='RGB';output.format.exr_codec='ZIP';s.node_tree.links.new(layers.outputs['Depth'],output.inputs[0]);s.render.use_compositing=True
views=[]
for view in raw['views']:
 if view['id'] not in a.views.split(','):continue
 name=view['id'];offset=Vector(view['offset']);cam.data.clip_start=view.get('near',raw['camera']['near']);cam.matrix_world=native.copy();cam.location=native.translation+rotation@offset;bpy.context.view_layer.update();target=out/(name+'-detail-depth.exr');started=time.monotonic()
 if not(a.reuse and target.exists()):
  output.file_slots[0].path=name+'-detail-depth';bpy.ops.render.render();(out/(name+'-detail-depth'+str(s.frame_current).zfill(4)+'.exr')).replace(target)
 if s.camera!=cam or (cam.matrix_world.translation-(native.translation+rotation@offset)).length>1e-5:raise RuntimeError('Depth camera reset '+name)
 matrix=conversion@cam.matrix_world;views.append({'id':name,'file':target.name,'width':s.render.resolution_x,'height':s.render.resolution_y,'near':cam.data.clip_start,'cameraMatrix':[matrix[r][c] for c in range(4) for r in range(4)],'seconds':round(time.monotonic()-started,2)})
 print('DETAIL_DEPTH_CAPTURED',name,views[-1]['seconds'],flush=True)
report={'method':'One-sample Cycles axial camera Z, matching each source camera rig transform and clip plane.','sourceSha256':sha,'space':'capture-camera-z','range':64,'views':views}
previous=out/'detail-depth.json'
if len(views)<len(raw['views']) and previous.exists():
 combined={v['id']:v for v in json.loads(previous.read_text(encoding='utf8'))['views']};combined.update({v['id']:v for v in views});report['views']=[combined[v['id']] for v in raw['views'] if v['id'] in combined]
previous.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
