"""Capture source-owned camera images without saving or executing source scripts.

Sequential Cycles only. --preview renders one native camera for visual/cost review.
"""
import argparse,bpy,hashlib,json,pathlib,sys,time
from mathutils import Matrix,Vector
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from scene_capture_setup import apply_derivations
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--camera');p.add_argument('--width',type=int,default=2560);p.add_argument('--samples',type=int,default=64);p.add_argument('--preview',action='store_true');p.add_argument('--radiance-only',action='store_true');p.add_argument('--reuse',action='store_true');p.add_argument('--views',default='center,left,right,up,down,front,back');p.add_argument('--back-distance',type=float,default=.3);p.add_argument('--perspective-focal',type=float);p.add_argument('--fixed-world-clip',action='store_true')
p.add_argument('--extend-ground');p.add_argument('--ground-scale',type=float,default=32);p.add_argument('--far',type=float);p.add_argument('--depth-width',type=int,default=1280);p.add_argument('--detail-depth',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
if (out/'.pause-capture').exists():
 print('CAPTURE_PAUSED: remove the output .pause-capture marker to resume; existing captures unchanged.',flush=True)
 sys.exit(0)
s=bpy.context.scene
derivations=apply_derivations([{'type':'extend-ground','object':a.extend_ground,'scaleXY':a.ground_scale}]) if a.extend_ground else []
if a.camera:s.camera=bpy.data.objects[a.camera]
source_camera=s.camera;position,rotation,scale=source_camera.matrix_world.decompose();native=Matrix.LocRotScale(position,rotation,Vector((1,1,1)))
cam=bpy.data.objects.new('PhotographicCaptureCamera',source_camera.data.copy());cam.data.animation_data_clear();s.collection.objects.link(cam);s.camera=cam;cam.matrix_world=native
source_far=cam.data.clip_end
if a.far:cam.data.clip_end=a.far
for marker in s.timeline_markers:marker.camera=None
source_projection=cam.data.type;source_lens=cam.data.lens;source_ortho_scale=cam.data.ortho_scale
if source_projection=='ORTHO':
 if not a.perspective_focal:raise ValueError('Orthographic source requires explicit --perspective-focal for physical photographic capture')
 cam.data.type='PERSP';cam.data.lens=a.perspective_focal
lens=cam.data.lens;source_near=cam.data.clip_start;native_width=s.render.resolution_x;native_height=s.render.resolution_y;aspect=native_width/native_height
s.render.use_persistent_data=True;s.render.engine='CYCLES';s.cycles.samples=a.samples;s.cycles.use_denoising=True;s.cycles.seed=17
s.render.use_compositing=False;s.render.use_sequencer=False;s.render.resolution_x=a.width;s.render.resolution_y=round(a.width/aspect);s.render.resolution_percentage=100
cam.data.dof.use_dof=False;cam.data.lens=lens if a.preview else lens/1.2
s.view_settings.view_transform='AgX';s.view_settings.look='None';s.view_settings.exposure=0;s.view_settings.gamma=1
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='CUDA';prefs.get_devices()
 for d in prefs.devices:d.use=d.type!='CPU'
 if any(d.type!='CPU' for d in prefs.devices):s.cycles.device='GPU'
 print('CYCLES_DEVICES',[(d.name,d.type,d.use) for d in prefs.devices],flush=True)
except Exception as e:print('DEVICE_FALLBACK',str(e),flush=True)
conversion=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)));views=[]
offsets=[('center',(0,0,0)),('left',(-.3,0,0)),('right',(.3,0,0)),('up',(0,.2,0)),('down',(0,-.2,0)),('front',(0,0,-.3)),('back',(0,0,a.back_distance))]
selected=[v for v in offsets if v[0] in a.views.split(',')]
for name,offset in offsets[:1] if a.preview else selected:
 cam.data.clip_start=source_near+offset[2] if a.fixed_world_clip else source_near
 cam.matrix_world=native.copy();cam.location=native.translation+rotation@Vector(offset);bpy.context.view_layer.update()
 file=out/(name+('.png' if a.preview else '.hdr'));started=time.monotonic()
 if not(a.reuse and file.exists()):
  s.render.image_settings.file_format='PNG' if a.preview else 'HDR';s.render.filepath=str(file);bpy.ops.render.render(write_still=True)
  if name=='center' and not a.preview:
   # Reuse this exact render for visual QA; no additional Cycles render.
   s.render.image_settings.file_format='PNG';bpy.data.images['Render Result'].save_render(str(out/'center-overscan-reference.png'),scene=s);s.render.image_settings.file_format='HDR'
 expected=native.translation+rotation@Vector(offset)
 if s.camera!=cam or (cam.matrix_world.translation-expected).length>1e-5:raise RuntimeError('Capture camera was reset during rendering: '+name)
 projection=cam.calc_matrix_camera(bpy.context.evaluated_depsgraph_get(),x=s.render.resolution_x,y=s.render.resolution_y,scale_x=s.render.pixel_aspect_x,scale_y=s.render.pixel_aspect_y)
 vp=projection@cam.matrix_world.inverted()@conversion.inverted();world_matrix=conversion@cam.matrix_world
 views.append({'id':name,'offset':list(offset),'near':cam.data.clip_start,'position':list(conversion@cam.matrix_world.translation),'matrix':[vp[r][c] for c in range(4) for r in range(4)],'cameraMatrix':[world_matrix[r][c] for c in range(4) for r in range(4)],'projectionMatrix':[projection[r][c] for c in range(4) for r in range(4)],'file':file.name,'seconds':round(time.monotonic()-started,2),'bytes':file.stat().st_size})
 print('VIEW_CAPTURED',name,views[-1]['seconds'],views[-1]['bytes'],flush=True)
report={'method':'Seven independently rendered source cameras. XYZ selects actual positions; pan and focal length reframe each capture.','sourceSha256':hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest(),'camera':{'name':source_camera.name,'lens':lens,'sourceProjection':source_projection,'sourceLens':source_lens,'sourceOrthoScale':source_ortho_scale,'sensorWidth':cam.data.sensor_width,'aspect':aspect,'nativeResolution':[native_width,native_height],'near':cam.data.clip_start,'far':cam.data.clip_end,'matrix':[list(r) for r in native],'sourceScale':list(scale)},'bounds':{'x':[-.3,.3],'y':[-.2,.2],'z':[-.3,a.back_distance],'yaw':[-35,35],'pitch':[-20,20],'roll':[-5,5]},'captureLens':cam.data.lens,'samples':a.samples,'views':views}
if not a.preview and len(views)<7 and (out/'viewfield.json').exists():
 previous=json.loads((out/'viewfield.json').read_text(encoding='utf8'));updated={v['id']:v for v in previous['views']};updated.update({v['id']:v for v in views});report['views']=[updated[name] for name,offset in offsets if name in updated]
report['camera']['near']=source_near
report['camera']['sourceFar']=source_far
report['camera']['shiftX']=cam.data.shift_x
report['camera']['shiftY']=cam.data.shift_y
report['camera']['sensorFit']=cam.data.sensor_fit
report['derivations']=derivations
report['camera']['sourceClippingMethod']='Fixed world near plane from architectural cutaway source; capture near = source near + camera-local backward offset.' if a.fixed_world_clip else 'Source camera near plane.'
for v in report['views']:v.setdefault('near',source_near+v['offset'][2] if a.fixed_world_clip else source_near)
(out/('preview.json' if a.preview else 'viewfield.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')

# Source axial-Z, at exactly the same seven normalized camera transforms.
if not a.preview and not a.radiance_only:
 cam.data.lens=lens/1.2;s.cycles.samples=1;s.cycles.use_denoising=False
 s.render.resolution_x=a.depth_width;s.render.resolution_y=round(a.depth_width/aspect)
 for layer in s.view_layers:layer.use_pass_z=True
 s.use_nodes=True;nodes=s.node_tree.nodes;nodes.clear();layers=nodes.new('CompositorNodeRLayers');layers.layer=bpy.context.view_layer.name
 output=nodes.new('CompositorNodeOutputFile');output.base_path=str(out)
 output.format.file_format='OPEN_EXR';output.format.color_depth='32';output.format.color_mode='RGB';output.format.exr_codec='ZIP'
 s.node_tree.links.new(layers.outputs['Depth'],output.inputs[0]);s.render.use_compositing=True
 depth_views=[];depth_suffix='-detail-depth' if a.detail_depth else '-depth'
 for name,offset in selected:
  cam.data.clip_start=source_near+offset[2] if a.fixed_world_clip else source_near
  target=out/(name+depth_suffix+'.exr')
  cam.matrix_world=native.copy();cam.location=native.translation+rotation@Vector(offset);bpy.context.view_layer.update()
  if not(a.reuse and target.exists()):
   output.file_slots[0].path=name+depth_suffix;bpy.ops.render.render()
   source=out/(name+depth_suffix+str(s.frame_current).zfill(4)+'.exr');source.replace(target)
  world_matrix=conversion@cam.matrix_world
  depth_views.append({'id':name,'file':target.name,'width':s.render.resolution_x,'height':s.render.resolution_y,'near':cam.data.clip_start,'cameraMatrix':[world_matrix[r][c] for c in range(4) for r in range(4)]})
  print('DEPTH_CAPTURED',name,target.stat().st_size,flush=True)
 if a.detail_depth:
  depth_report={'sourceSha256':report['sourceSha256'],'method':'One-sample Cycles axial Z at the matching radiance camera and per-view clip plane.','space':'capture-camera-z','range':64,'views':depth_views};depth_path=out/'detail-depth.json'
  if depth_path.exists() and len(depth_views)<7:
   merged={v['id']:v for v in json.loads(depth_path.read_text(encoding='utf8'))['views']};merged.update({v['id']:v for v in depth_views});depth_report['views']=[merged[name] for name,offset in offsets if name in merged]
  depth_path.write_text(json.dumps(depth_report,indent=2)+'\n',encoding='utf8')






