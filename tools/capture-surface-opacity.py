"""Record constant-diffuse/transparent coverage already captured in the albedo bake."""
import argparse,bpy,hashlib,json,pathlib,sys
p=argparse.ArgumentParser();p.add_argument('--work',required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);work=pathlib.Path(a.work).resolve()
report=json.loads((work/'bake.json').read_text(encoding='utf-8'));report['opacityMaps']={}
if hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest()!=report['sourceSha256']:raise ValueError('Opacity source differs from surface bake')
for material in bpy.data.materials:
 if not material.use_nodes:continue
 output=next((n for n in material.node_tree.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output),None)
 if not output or not output.inputs['Surface'].is_linked:continue
 mix=output.inputs['Surface'].links[0].from_node
 if mix.type!='MIX_SHADER' or not all(s.is_linked for s in mix.inputs):continue
 shaders=[s.links[0].from_node for s in mix.inputs[1:]]
 if {n.type for n in shaders}!={'BSDF_TRANSPARENT','BSDF_DIFFUSE'}:continue
 diffuse=next(n for n in shaders if n.type=='BSDF_DIFFUSE')
 if diffuse.inputs['Color'].is_linked:continue
 report['opacityMaps'][material.name+'-web']={'color':list(diffuse.inputs['Color'].default_value),'method':'Diffuse-colour bake contains source shader coverage in its original atlas UVs'}
 print('SOURCE_OPACITY',material.name,flush=True)
(work/'bake.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
