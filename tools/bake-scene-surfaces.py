"""Bake source material colour and static diffuse light onto the shipped geometry.

The source .blend stays unchanged. Outputs use the source asset's license.
"""
import argparse,bpy,hashlib,json,pathlib,sys,time,zlib
p=argparse.ArgumentParser();p.add_argument('--work',required=True);p.add_argument('--size',type=int,default=2048);p.add_argument('--samples',type=int,default=32);p.add_argument('--passes',default='albedo,roughness')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);work=pathlib.Path(a.work).resolve();meta=json.loads((work/'targets.json').read_text(encoding='utf-8'))
import numpy as np
if hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest()!=meta['sourceSha256']:raise ValueError('Source scene hash differs from target geometry')
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=a.samples;s.cycles.use_denoising=True;s.render.use_persistent_data=True
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='CUDA';prefs.get_devices()
 for d in prefs.devices:d.use=d.type=='CUDA'
 if any(d.use for d in prefs.devices):s.cycles.device='GPU'
except Exception:s.cycles.device='CPU'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.make_local(type='ALL');bpy.ops.object.duplicates_make_real(use_base_parent=True,use_hierarchy=True)
sources=[]
for o in s.objects:
 if o.type!='MESH' or o.hide_render:continue
 if any(m and m.use_nodes and any(n.type=='OUTPUT_MATERIAL' and n.inputs['Volume'].is_linked and not n.inputs['Surface'].is_linked for n in m.node_tree.nodes) for m in o.data.materials):continue
 for modifier in o.modifiers:
  if modifier.type=='SUBSURF':modifier.levels=min(modifier.levels,1);modifier.render_levels=modifier.levels
 sources.append(o)
# Batch source surfaces by ray visibility. Carry original object/generated/UV
# coordinates as attributes so joining does not change procedural materials.
# A handful of bake sources avoids rebuilding the whole room for every object.
deps=bpy.context.evaluated_depsgraph_get();batches={}
for source in sources:
 mesh=bpy.data.meshes.new_from_object(source.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
 if not mesh.vertices:continue
 coordinates=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',coordinates);coordinates=coordinates.reshape(-1,3)
 low=coordinates.min(axis=0);span=np.maximum(coordinates.max(axis=0)-low,1e-8)
 for name,values in [('webObject',coordinates),('webGenerated',(coordinates-low)/span),('webLocation',np.tile(source.matrix_world.translation,(len(coordinates),1)))]:
  attribute=mesh.attributes.new(name,'FLOAT_VECTOR','POINT');attribute.data.foreach_set('vector',np.asarray(values,dtype=np.float32).reshape(-1))
 random=mesh.attributes.new('webRandom','FLOAT','POINT');random.data.foreach_set('value',np.full(len(coordinates),zlib.crc32(source.name.encode('utf-8'))/0xffffffff,dtype=np.float32))
 if mesh.uv_layers.active:
  original=mesh.uv_layers.active;values=np.empty(len(original.data)*2,dtype=np.float32);original.data.foreach_get('uv',values)
  layer=mesh.uv_layers.get('webUV') or mesh.uv_layers.new(name='webUV');layer.data.foreach_set('uv',values);mesh.uv_layers.active=layer;layer.active_render=True
 clone=bpy.data.objects.new('BAKE-'+source.name,mesh);s.collection.objects.link(clone);clone.matrix_world=source.matrix_world.copy()
 visibility=tuple(getattr(source,'visible_'+key) for key in ['camera','diffuse','glossy','transmission','shadow'])
 batches.setdefault(visibility,[]).append(clone);source.hide_render=True
trees=set()
def preserve_coordinates(tree):
 if tree in trees:return
 trees.add(tree)
 for node in list(tree.nodes):
  if node.type=='GROUP' and node.node_tree:preserve_coordinates(node.node_tree)
  replacements={}
  if node.type=='TEX_COORD':replacements={'Generated':'webGenerated','UV':'webUV',**({'Object':'webObject'} if not node.object else {})}
  if node.type=='OBJECT_INFO':replacements={'Location':'webLocation','Random':'webRandom'}
  for output,name in replacements.items():
   if not node.outputs[output].is_linked:continue
   replacement=tree.nodes.new('ShaderNodeUVMap' if name=='webUV' else 'ShaderNodeAttribute')
   if name=='webUV':replacement.uv_map=name;socket=replacement.outputs['UV']
   else:replacement.attribute_name=name;socket=replacement.outputs['Fac' if name=='webRandom' else 'Vector']
   for link in list(node.outputs[output].links):tree.links.new(socket,link.to_socket)
  if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:
   replacement=tree.nodes.new('ShaderNodeUVMap');replacement.uv_map='webUV';tree.links.new(replacement.outputs['UV'],node.inputs['Vector'])
for material in bpy.data.materials:
 if material.use_nodes:preserve_coordinates(material.node_tree)
sources=[]
for visibility,objects in batches.items():
 bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();joined=bpy.context.object
 for key,value in zip(['camera','diffuse','glossy','transmission','shadow'],visibility):setattr(joined,'visible_'+key,value)
 sources.append(joined)
print('BAKE_SOURCE_BATCHES',len(sources),flush=True)
positions=np.fromfile(work/'positions.bin',dtype=np.float32).reshape(-1,3)
valid=np.fromfile(work/'valid.bin',dtype=np.bool_);mapped=np.fromfile(work/'uv.bin',dtype=np.float32).reshape(-1,3,2)
triangles=np.arange(len(positions),dtype=np.uint32).reshape(-1,3)
normals=np.fromfile(work/'normals.bin',dtype=np.float32).reshape(-1,3);selected=triangles[valid].copy();loop_uv=mapped[valid].copy()
points=positions[selected];cross=np.cross(points[:,1]-points[:,0],points[:,2]-points[:,0]);flip=np.einsum('ij,ij->i',cross,normals[selected].mean(axis=1))<0
selected[flip]=selected[flip][:,[0,2,1]];loop_uv[flip]=loop_uv[flip][:,[0,2,1]]
mesh=bpy.data.meshes.new('SourceSurfaceAtlas');mesh.from_pydata(positions.tolist(),[],selected.tolist());mesh.update()
mesh.polygons.foreach_set('use_smooth',np.ones(len(mesh.polygons),dtype=np.bool_));mesh.normals_split_custom_set_from_vertices(normals.tolist())
target=bpy.data.objects.new('WEB-surface-bake-target',mesh);s.collection.objects.link(target)
for ray in ['diffuse','glossy','transmission','shadow','volume_scatter']:setattr(target,'visible_'+ray,False)
uv=mesh.uv_layers.new(name='SourceBakeUV');mesh.uv_layers.active=uv;uv.active_render=True
uv.data.foreach_set('uv',loop_uv.reshape(-1))
material=bpy.data.materials.new('WEB-atlas-target');material.use_nodes=True;mesh.materials.append(material)
bpy.ops.object.select_all(action='DESELECT');target.select_set(True);bpy.context.view_layer.objects.active=target
direct_images=[];diffuse_only=[]
for source_material in bpy.data.materials:
 if not source_material.use_nodes:continue
 shaders=[n for n in source_material.node_tree.nodes if n.type in {'BSDF_DIFFUSE','BSDF_PRINCIPLED'}]
 colors=[n.inputs.get('Base Color') or n.inputs.get('Color') for n in shaders]
 if colors and all(c and c.is_linked and c.links[0].from_node.type=='TEX_IMAGE' for c in colors):direct_images.append(source_material.name+'-web')
 if shaders and not any(n.type in {'BSDF_GLOSSY','BSDF_ANISOTROPIC','BSDF_PRINCIPLED'} for n in source_material.node_tree.nodes):diffuse_only.append(source_material.name+'-web')
report={'sourceSha256':meta['sourceSha256'],'samples':a.samples,'triangles':len(mesh.polygons),'directImageMaterials':direct_images,'diffuseOnlyMaterials':diffuse_only,'method':'Cycles selected-to-active material bake onto shipped world-space geometry','maps':{}}
if (work/'bake.json').exists():report['maps']=json.loads((work/'bake.json').read_text(encoding='utf-8'))['maps']
for label,kind,passes,size in [('albedo','DIFFUSE',{'COLOR'},a.size),('roughness','ROUGHNESS',set(),a.size//2)]:
 if label not in a.passes.split(','):continue
 image=bpy.data.images.new('WEB-'+label,width=size,height=size,alpha=False);image.colorspace_settings.name='sRGB' if label=='albedo' else 'Non-Color'
 node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;material.node_tree.nodes.active=node
 bpy.ops.object.select_all(action='DESELECT')
 for source in sources:source.select_set(True)
 target.select_set(True);bpy.context.view_layer.objects.active=target
 started=time.monotonic();print('BAKE_START',label,flush=True)
 opts={'type':kind,'use_selected_to_active':True,'cage_extrusion':.003,'max_ray_distance':.012,'margin':max(1,round(size/a.size*2)),'use_clear':True}
 if passes:opts['pass_filter']=passes
 bpy.ops.object.bake(**opts)
 image.filepath_raw=str(work/(label+'.png'));image.file_format='PNG';image.save()
 report['maps'][label]={'width':size,'seconds':round(time.monotonic()-started,2)};print('BAKE_DONE',label,report['maps'][label],flush=True)
(work/'bake.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
