"""One tiny source-room reflection/irradiance probe at the photographic subject."""
import argparse,bpy,math,pathlib,sys
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--position',nargs=3,type=float,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);s=bpy.context.scene;camera=s.camera
camera.location=(a.position[0],-a.position[2],a.position[1]);camera.rotation_euler=(math.pi/2,0,0)
camera.data.type='PANO';camera.data.panorama_type='EQUIRECTANGULAR';camera.data.clip_start=.01;camera.data.dof.use_dof=False
s.render.engine='CYCLES';s.cycles.samples=16;s.cycles.use_denoising=True;s.render.resolution_x=256;s.render.resolution_y=128;s.render.resolution_percentage=100
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='CUDA';prefs.get_devices()
    for d in prefs.devices:d.use=d.type!='CPU'
    if any(d.type!='CPU' for d in prefs.devices):s.cycles.device='GPU'
except Exception:pass
s.render.image_settings.file_format='HDR';s.render.filepath=str(pathlib.Path(a.output).resolve());bpy.ops.render.render(write_still=True)
