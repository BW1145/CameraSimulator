"""Export source-camera Z passes for the seven photographic positions only."""
import argparse,bpy,pathlib,sys
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--output',required=True)
args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=pathlib.Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;cam=s.camera;native=cam.matrix_world.copy();cam.data.lens/=1.2;cam.data.dof.use_dof=False
aspect=s.render.resolution_x/s.render.resolution_y
s.render.engine='CYCLES';s.cycles.samples=1;s.cycles.use_denoising=False
s.render.resolution_x=1280;s.render.resolution_y=round(1280/aspect);s.render.resolution_percentage=100
s.view_layers[0].use_pass_z=True;s.use_nodes=True;nodes=s.node_tree.nodes;nodes.clear()
layers=nodes.new('CompositorNodeRLayers');output=nodes.new('CompositorNodeOutputFile');output.base_path=str(out)
output.format.file_format='OPEN_EXR';output.format.color_depth='32';output.format.color_mode='RGB';output.format.exr_codec='ZIP'
s.node_tree.links.new(layers.outputs['Depth'],output.inputs[0]);s.render.use_compositing=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='CUDA';prefs.get_devices()
    for d in prefs.devices:d.use=d.type!='CPU'
    if any(d.type!='CPU' for d in prefs.devices):s.cycles.device='GPU'
except Exception:pass
for name,offset in [('center',(0,0,0)),('left',(-.3,0,0)),('right',(.3,0,0)),('up',(0,.2,0)),('down',(0,-.2,0)),('front',(0,0,-.3)),('back',(0,0,.3))]:
    cam.matrix_world=native.copy();cam.location=native.translation+native.to_quaternion()@Vector(offset);bpy.context.view_layer.update()
    output.file_slots[0].path=name+'-depth';bpy.ops.render.render()
    source=out/(name+'-depth'+str(s.frame_current).zfill(4)+'.exr');source.replace(out/(name+'-depth.exr'))
    print('DEPTH_CAPTURED',name,(out/(name+'-depth.exr')).stat().st_size,flush=True)
