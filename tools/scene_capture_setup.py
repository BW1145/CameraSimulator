"""Explicit in-memory derivations shared by radiance, depth and flash capture."""
import bpy

def apply_derivations(recipes):
 result=[]
 for recipe in recipes:
  if recipe['type']!='extend-ground':raise ValueError('Unknown scene derivation '+recipe['type'])
  obj=bpy.data.objects[recipe['object']]
  if obj.type!='MESH':raise ValueError('Ground extension requires a mesh')
  original=list(obj.dimensions);obj.data=obj.data.copy()
  for vertex in obj.data.vertices:
   vertex.co.x*=recipe['scaleXY'];vertex.co.y*=recipe['scaleXY']
  obj.data.update();bpy.context.view_layer.update()
  result.append({**recipe,'sourceDimensions':original,'derivedDimensions':list(obj.dimensions),'materials':[m.name if m else None for m in obj.data.materials],'method':'Extend source ground mesh XY in memory with the same material; source blend unchanged.'})
 return result
