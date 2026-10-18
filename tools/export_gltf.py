"""Export an authorized complete scene with Blender 4.5 LTS.

blender -b source.blend --disable-autoexec --python tools/export_gltf.py -- --id kitchen --output public/scenes/kitchen
"""
import argparse, hashlib, json, pathlib, sys
import bpy

p=argparse.ArgumentParser()
p.add_argument('--id',required=True);p.add_argument('--output',required=True)
p.add_argument('--camera');p.add_argument('--triangles',type=int,default=650000)
args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=pathlib.Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
source=pathlib.Path(bpy.data.filepath);s=bpy.context.scene
if args.camera:s.camera=bpy.data.objects[args.camera]
if not s.camera:raise RuntimeError('Choose a source camera with --camera')
camera=s.camera;camera.data.type='PERSP';camera.data.lens=35;camera.data.sensor_width=36;camera.data.dof.use_dof=False
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.make_local(type='ALL')

def find_image(node,seen):
    if node in seen:return None
    seen.add(node)
    if node.type=='TEX_IMAGE' and node.image and node.image.size[0]>0:return node.image
    for socket in node.inputs:
        for link in socket.links:
            image=find_image(link.from_node,seen)
            if image:return image
    return None

# Include materials used by linked collection instances, without realizing those
# instances a second time. Preserve source colours and diffuse image textures.
for m in list(bpy.data.materials):
    if not m.use_nodes or any(n.type=='BSDF_PRINCIPLED' for n in m.node_tree.nodes):continue
    nodes=m.node_tree.nodes
    if any(n.type=='OUTPUT_MATERIAL' and n.inputs['Volume'].is_linked and not n.inputs['Surface'].is_linked for n in nodes):continue
    bsdf=next((n for n in nodes if n.type=='BSDF_DIFFUSE'),None) or next((n for n in nodes if n.type in {'BSDF_GLOSSY','BSDF_GLASS'}),None)
    replacement=bpy.data.materials.new(m.name+'-web');replacement.use_nodes=True
    principled=replacement.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value=bsdf.inputs['Color'].default_value if bsdf else m.diffuse_color
    principled.inputs['Roughness'].default_value=.6
    if bsdf and bsdf.type=='BSDF_GLASS':principled.inputs['Transmission Weight'].default_value=.8
    if 'glass' in m.name.lower() and 'cap' not in m.name.lower():
        principled.inputs['Transmission Weight'].default_value=.8
        principled.inputs['Base Color'].default_value=(1,1,1,1)
        principled.inputs['Roughness'].default_value=.1
    image=find_image(bsdf,set()) if bsdf else None
    if image:
        tex=replacement.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
        replacement.node_tree.links.new(tex.outputs['Color'],principled.inputs['Base Color'])
    m.user_remap(replacement)

excluded_volumes=[]
for ob in list(bpy.data.objects):
    if ob.type!='MESH':continue
    volume_only=any(slot.material and slot.material.use_nodes and any(n.type=='OUTPUT_MATERIAL' and n.inputs['Volume'].is_linked and not n.inputs['Surface'].is_linked for n in slot.material.node_tree.nodes) for slot in ob.material_slots)
    if volume_only:
        ob.hide_render=True;excluded_volumes.append(ob.name);continue
    for mod in ob.modifiers:
        if mod.type=='SUBSURF':mod.levels=min(1,mod.levels);mod.render_levels=mod.levels
for image in bpy.data.images:
    if image.type=='IMAGE' and max(image.size)>1024:
        ratio=1024/max(image.size);image.scale(max(1,round(image.size[0]*ratio)),max(1,round(image.size[1]*ratio)))

meshes=[o for o in s.objects if o.type=='MESH' and not o.hide_render]
total=sum(len(o.data.polygons)*2 for o in meshes)
if total>args.triangles:
    for o in meshes:
        if len(o.data.polygons)>2000:
            mod=o.modifiers.new('Web triangle budget','DECIMATE');mod.ratio=args.triangles/total
bpy.ops.export_scene.gltf(filepath=str(out/'scene.glb'),export_format='GLB',use_visible=True,use_renderable=True,use_active_scene=True,export_apply=True,export_cameras=True,export_lights=True,export_animations=False,export_extras=False,export_yup=True,export_image_format='JPEG',export_jpeg_quality=80)
meta={'id':args.id,'camera':camera.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'blender':bpy.app.version_string,'sourceObjects':len(meshes),'sourcePolygonEstimate':total,'triangleBudget':args.triangles,'maxTextureSize':1024,'bytes':(out/'scene.glb').stat().st_size,'excludedVolumeBoundaries':excluded_volumes,'changes':'Complete active scene exported to glTF, retaining source geometry layout and collection instances. Image textures resized to 1024px, subdivision limited to level 1, large meshes decimated, legacy shaders converted to source BSDF colours and diffuse image maps. Volume boundary meshes omitted from surface rendering. Perspective cameras exported at 35mm; web lighting uses punctual lights plus ambient fill.'}
(out/'model.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
print('EXPORTED',json.dumps(meta),flush=True)
