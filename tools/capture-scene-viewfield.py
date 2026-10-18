"""Source-radiance captures for a bounded photographic camera rig.

Run against the unmodified source .blend with --disable-autoexec. The camera
can translate inside 60 x 40 x 60 cm; it is not a room-navigation renderer.
Images are scene-linear HDR, so exposure/white balance stay live in the browser.
The browser selects an actual captured camera for XYZ and reframes its image.
"""
import argparse,bpy,hashlib,json,pathlib,sys,time
from mathutils import Matrix,Vector
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--reuse',action='store_true')
args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=pathlib.Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;cam=s.camera;native=cam.matrix_world.copy();lens=cam.data.lens
native_width=s.render.resolution_x;native_height=s.render.resolution_y;aspect=native_width/native_height
s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=True
s.render.resolution_x=2560;s.render.resolution_y=round(2560/aspect);s.render.resolution_percentage=100
cam.data.dof.use_dof=False;cam.data.lens=lens/1.2
s.view_settings.view_transform='AgX';s.view_settings.look='None';s.view_settings.exposure=0;s.view_settings.gamma=1
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='CUDA';prefs.get_devices()
    for d in prefs.devices:d.use=d.type!='CPU'
    if any(d.type!='CPU' for d in prefs.devices):s.cycles.device='GPU'
except Exception:pass
conversion=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
views=[]
for name,offset in [('center',(0,0,0)),('left',(-.3,0,0)),('right',(.3,0,0)),('up',(0,.2,0)),('down',(0,-.2,0)),('front',(0,0,-.3)),('back',(0,0,.3))]:
    cam.matrix_world=native.copy();cam.location=native.translation+native.to_quaternion()@Vector(offset);bpy.context.view_layer.update()
    file=out/(name+'.hdr');started=time.monotonic()
    if not(args.reuse and file.exists()):
        s.render.image_settings.file_format='HDR';s.render.filepath=str(file);bpy.ops.render.render(write_still=True)
    projection=cam.calc_matrix_camera(bpy.context.evaluated_depsgraph_get(),x=s.render.resolution_x,y=s.render.resolution_y,scale_x=s.render.pixel_aspect_x,scale_y=s.render.pixel_aspect_y)
    view=cam.matrix_world.inverted()@conversion.inverted();vp=projection@view
    world_matrix=conversion@cam.matrix_world
    views.append({'id':name,'offset':list(offset),'position':list(conversion@cam.matrix_world.translation),'matrix':[vp[r][c] for c in range(4) for r in range(4)],'cameraMatrix':[world_matrix[r][c] for c in range(4) for r in range(4)],'projectionMatrix':[projection[r][c] for c in range(4) for r in range(4)],'file':file.name,'seconds':round(time.monotonic()-started,2),'bytes':file.stat().st_size})
    print('VIEW_CAPTURED',name,views[-1]['seconds'],views[-1]['bytes'],flush=True)
    if name=='center' and not(args.reuse and (out/'source-camera.png').exists()):
        # A native-lens source image is the explicit matching-camera reference.
        cam.data.lens=lens;s.render.resolution_x=2048;s.render.resolution_y=round(2048/aspect)
        s.render.image_settings.file_format='PNG';s.render.filepath=str(out/'source-camera.png');bpy.ops.render.render(write_still=True)
        cam.data.lens=lens/1.2;s.render.resolution_x=2560;s.render.resolution_y=round(2560/aspect)
report={'method':'Seven independently rendered source cameras. XYZ selects actual positions; pan and focal length reframe each capture. No full-room navigation or synthesized disocclusion.','sourceSha256':hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest(),'camera':{'lens':lens,'sensorWidth':cam.data.sensor_width,'aspect':aspect,'nativeResolution':[native_width,native_height],'near':cam.data.clip_start,'far':cam.data.clip_end,'matrix':[list(r) for r in native]},'bounds':{'x':[-.3,.3],'y':[-.2,.2],'z':[-.3,.3],'yaw':[-35,35],'pitch':[-20,20],'roll':[-5,5]},'captureLens':cam.data.lens,'samples':32,'views':views}
(out/'viewfield.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
