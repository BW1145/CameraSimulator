"""Bake one bounded cabinet material milestone from the unmodified Blender source.

blender -b barber.blend --disable-autoexec --python tools/bake-material-sample.py -- --output public/scenes/barbershop-sample

Uses Cycles selected-to-active baking, so original mapping, node groups and object
coordinates are evaluated on the source objects, not guessed from a first image.
"""
import argparse,bmesh,bpy,hashlib,json,pathlib,runpy,sys,time
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--reuse',action='store_true');p.add_argument('--rebake-normal',action='store_true')
args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=pathlib.Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='CUDA';prefs.get_devices()
    for d in prefs.devices:d.use=d.type!='CPU'
    if any(d.type!='CPU' for d in prefs.devices):scene.cycles.device='GPU'
except Exception:pass
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.make_local(type='ALL')
priority={'wood_dresser','wood_furniture_dresser','wood_furniture_generic','wood_light.003','marble','brass_knob.002'}
sources=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('GEO-Dresser') and any(m.material and m.material.name in priority for m in o.material_slots)]
for o in scene.objects:
    for m in o.modifiers:
        if m.type=='SUBSURF':m.levels=min(m.levels,1);m.render_levels=m.levels
deps=bpy.context.evaluated_depsgraph_get();targets=[]
for source_id,source in enumerate(sources):
    mesh=bpy.data.meshes.new_from_object(source.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
    mesh.attributes.new('webSourceObject','INT','FACE');mesh.attributes.new('webSourceFace','INT','FACE')
    object_ids=mesh.attributes['webSourceObject'];face_ids=mesh.attributes['webSourceFace']
    for f in mesh.polygons:object_ids.data[f.index].value=source_id;face_ids.data[f.index].value=f.index
    bm=bmesh.new();bm.from_mesh(mesh)
    remove=[f for f in bm.faces if mesh.materials[f.material_index].name not in priority]
    bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(mesh);bm.free()
    ob=bpy.data.objects.new('WEB-'+source.name,mesh);scene.collection.objects.link(ob);ob.matrix_world=source.matrix_world.copy();targets.append(ob)
bpy.ops.object.select_all(action='DESELECT')
for o in targets:o.select_set(True)
bpy.context.view_layer.objects.active=targets[0];bpy.ops.object.join();target=bpy.context.object;target.name='WEB-cabinet-PBR-sample'
# A second UV atlas leaves every source UV and procedural coordinate untouched.
uv=target.data.uv_layers.new(name='WebBakeUV');target.data.uv_layers.active=uv;uv.active_render=True
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
mat=bpy.data.materials.new('WEB-cabinet-baked-PBR');mat.use_nodes=True;target.data.materials.clear();target.data.materials.append(mat)
for f in target.data.polygons:f.material_index=0
nodes=mat.node_tree.nodes;links=mat.node_tree.links;principled=nodes.get('Principled BSDF');uvnode=nodes.new('ShaderNodeUVMap');uvnode.uv_map='WebBakeUV'
report={'scope':'Bounded cabinet material sample; overall scene lighting and original desk-fan camera are not accepted yet','sourceSha256':hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest(),'objects':len(sources),'materials':sorted(priority),'maps':{},'method':'Cycles selected-to-active for colour, roughness and indirect; direct source-surface tangent normal bake; original node groups and mapping evaluated','samples':16}
images={}
def bake_surface_normals(image):
    # Thin cabinet panels can project onto their opposite face. Bake the source
    # surface's own tangent normal into the atlas instead of ray-projecting it.
    uv_by_source={};atlas_uv=target.data.uv_layers['WebBakeUV']
    object_ids=target.data.attributes['webSourceObject'];face_ids=target.data.attributes['webSourceFace']
    for f in target.data.polygons:
        uv_by_source[(object_ids.data[f.index].value,face_ids.data[f.index].value)]=[tuple(atlas_uv.data[i].uv) for i in f.loop_indices]
    print('NORMAL_UV_MAPPED',len(uv_by_source),flush=True)
    clones=[];old_active=[]
    for source_id,source in enumerate(sources):
        mesh=bpy.data.meshes.new_from_object(source.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
        layer=mesh.uv_layers.new(name='WebBakeUV');mesh.uv_layers.active=layer
        for f in mesh.polygons:
            values=uv_by_source.get((source_id,f.index))
            for i,li in enumerate(f.loop_indices):layer.data[li].uv=values[i] if values else (-2,-2)
        ob=bpy.data.objects.new('BAKE-'+source.name,mesh);scene.collection.objects.link(ob);ob.matrix_world=source.matrix_world.copy();clones.append(ob)
        for material in mesh.materials:
            if not material or not material.use_nodes:continue
            if any(m is material for m,_ in old_active):continue
            old_active.append((material,material.node_tree.nodes.active));node=material.node_tree.nodes.new('ShaderNodeTexImage');node.name='WEB-Normal-Bake-Target';node.image=image;material.node_tree.nodes.active=node
    bpy.ops.object.select_all(action='DESELECT')
    for ob in clones:ob.select_set(True)
    bpy.context.view_layer.objects.active=clones[0]
    print('NORMAL_SOURCE_SURFACES_READY',len(clones),flush=True)
    bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',uv_layer='WebBakeUV',use_selected_to_active=False,margin=12,use_clear=False)
    for material,active in old_active:
        material.node_tree.nodes.remove(material.node_tree.nodes['WEB-Normal-Bake-Target']);material.node_tree.nodes.active=active
    for ob in clones:bpy.data.objects.remove(ob,do_unlink=True)
for label,size,kind,passes in [('baseColor',2048,'DIFFUSE',{'COLOR'}),('roughness',1024,'ROUGHNESS',set()),('normal',1024,'NORMAL',set()),('indirect',1024,'DIFFUSE',{'INDIRECT'})]:
    cached=args.reuse and (out/(label+'.png')).is_file() and not(label=='normal' and args.rebake_normal)
    image=bpy.data.images.load(str(out/(label+'.png')),check_existing=False) if cached else bpy.data.images.new('WEB-cabinet-'+label,width=size,height=size,alpha=False,float_buffer=label=='indirect')
    image.name='WEB-cabinet-'+label;image.colorspace_settings.name='sRGB' if label=='baseColor' else 'Non-Color'
    tex=nodes.new('ShaderNodeTexImage');tex.image=image;links.new(uvnode.outputs['UV'],tex.inputs['Vector']);nodes.active=tex;tex.select=True
    if cached:
        if tuple(image.size)!=(size,size):raise RuntimeError('Cached bake resolution changed: '+label)
        image.pack();images[label]=(image,tex);report['maps'][label]={'width':size,'reused':True};continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in sources:o.select_set(True)
    target.select_set(True);bpy.context.view_layer.objects.active=target
    print('BAKE_START',label,flush=True);started=time.monotonic()
    opts={'type':kind,'use_selected_to_active':True,'cage_extrusion':.025,'max_ray_distance':.06,'margin':12,'use_clear':True}
    if passes:opts['pass_filter']=passes
    if label=='normal':bake_surface_normals(image)
    else:bpy.ops.object.bake(**opts)
    image.filepath_raw=str(out/(label+'.png'));image.file_format='PNG';image.save();image.pack();images[label]=(image,tex)
    report['maps'][label]={'width':size,'seconds':round(time.monotonic()-started,2)}
    print('BAKE_DONE',label,report['maps'][label],flush=True)
links.new(images['baseColor'][1].outputs['Color'],principled.inputs['Base Color'])
links.new(images['roughness'][1].outputs['Color'],principled.inputs['Roughness'])
normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='WebBakeUV';links.new(images['normal'][1].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],principled.inputs['Normal'])
mat['bakedIndirect']='indirect.png';mat['bakedIndirectUV']=1
# Remove only the faces replaced by the baked opaque atlas. Mirrors and glass
# remain separate source surfaces and can keep their reflection/transmission.
for source in sources:
    mesh=bpy.data.meshes.new_from_object(source.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
    bm=bmesh.new();bm.from_mesh(mesh);remove=[f for f in bm.faces if mesh.materials[f.material_index].name in priority]
    bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(mesh);bm.free();source.data=mesh;source.modifiers.clear()
    if len(mesh.polygons)==0:source.hide_render=True
report['sourceCamera']={'lens':scene.camera.data.lens,'sensorWidth':scene.camera.data.sensor_width,'matrix':[list(r) for r in scene.camera.matrix_world]}
(out/'bake-report.json').write_text(json.dumps(report,indent=2)+'\n')
sys.argv=['export_gltf.py','--','--id','barbershop','--output',str(out),'--max-texture','2048']
runpy.run_path(str(pathlib.Path(__file__).with_name('export_gltf.py')),run_name='__main__')
