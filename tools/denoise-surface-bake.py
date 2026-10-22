"""Denoise a freshly baked irradiance atlas in a factory-startup Blender process."""
import bpy,json,pathlib,sys
work=pathlib.Path(sys.argv[sys.argv.index('--')+1]).resolve();src=work/'irradiance.hdr'
backup=work/'irradiance-raw.hdr'
backup.write_bytes(src.read_bytes())
s=bpy.context.scene;s.use_nodes=True;s.node_tree.nodes.clear()
image=s.node_tree.nodes.new('CompositorNodeImage');image.image=bpy.data.images.load(str(backup));image.image.colorspace_settings.name='Non-Color'
den=s.node_tree.nodes.new('CompositorNodeDenoise');den.prefilter='ACCURATE';s.node_tree.links.new(image.outputs['Image'],den.inputs['Image'])
out=s.node_tree.nodes.new('CompositorNodeComposite');s.node_tree.links.new(den.outputs['Image'],out.inputs['Image'])
s.render.resolution_x=image.image.size[0];s.render.resolution_y=image.image.size[1];s.render.resolution_percentage=100
s.view_settings.view_transform='Raw';s.render.image_settings.file_format='HDR';s.render.filepath=str(src)
bpy.ops.render.render(write_still=True)
report=json.loads((work/'bake.json').read_text(encoding='utf-8'))
report['maps']['irradiance']['denoising']='OpenImageDenoise via Blender compositor, accurate prefilter'
(work/'bake.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')

