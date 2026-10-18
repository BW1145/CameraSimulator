import bpy,json,pathlib
s=bpy.context.scene
out={'source':bpy.data.filepath,'scene':s.name,'engine':s.render.engine,'resolution':[s.render.resolution_x,s.render.resolution_y,s.render.resolution_percentage],'frame':s.frame_current,'camera':s.camera.name if s.camera else None,'cameras':[],'images':[],'lights':[],'objects':len(s.objects),'units':s.unit_settings.scale_length,'view':s.view_settings.view_transform,'world':s.world.name if s.world else None}
for o in s.objects:
 if o.type=='CAMERA':out['cameras'].append({'name':o.name,'lens':o.data.lens,'sensor':o.data.sensor_width,'near':o.data.clip_start,'far':o.data.clip_end,'position':list(o.matrix_world.translation),'matrix':[list(r) for r in o.matrix_world]})
 if o.type=='LIGHT':out['lights'].append({'name':o.name,'type':o.data.type,'power':o.data.energy})
for im in bpy.data.images:
 if im.source=='FILE':
  path=bpy.path.abspath(im.filepath,library=im.library)
  out['images'].append({'name':im.name,'path':path,'packed':bool(im.packed_file),'exists':pathlib.Path(path).is_file()})
print('SCENE_INSPECT_JSON '+json.dumps(out),flush=True)
