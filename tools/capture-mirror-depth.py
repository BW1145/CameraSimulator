"""Unfold source mirror rays into virtual camera-Z for photographic focus."""
import argparse,bpy,hashlib,json,pathlib,re,sys
import numpy as np
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser();p.add_argument('--pack',required=True);p.add_argument('--output',required=True);p.add_argument('--views',default='center,left,right,up,down,front,back')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);pack=pathlib.Path(a.pack).resolve();out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
manifest=json.loads((pack/'manifest.json').read_text(encoding='utf-8'))
if hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest()!=manifest['sourceSha256']:raise ValueError('Source hash differs from photographic pack')
s=bpy.context.scene;deps=bpy.context.evaluated_depsgraph_get();triangles=[];vertices=[];faces=[]
for instance in deps.object_instances:
 ob=instance.object
 if ob.type!='MESH' or ob.hide_render:continue
 if not ob.visible_glossy:continue
 volume={i for i,m in enumerate(ob.data.materials) if m and m.use_nodes and any(n.type=='OUTPUT_MATERIAL' and n.inputs['Volume'].is_linked and not n.inputs['Surface'].is_linked for n in m.node_tree.nodes)}
 indices={i for i,m in enumerate(ob.data.materials) if m and re.search('mirror',m.name,re.I)}
 mesh=ob.to_mesh();mesh.calc_loop_triangles()
 offset=len(vertices);vertices.extend(instance.matrix_world@v.co for v in mesh.vertices)
 for triangle in mesh.loop_triangles:
  if triangle.material_index in volume:continue
  faces.append(tuple(offset+i for i in triangle.vertices))
  if triangle.material_index not in indices:continue
  points=[instance.matrix_world@mesh.vertices[i].co for i in triangle.vertices]
  triangles.append(np.array([(p.x,p.z,-p.y) for p in points]))
 ob.to_mesh_clear()
print('MIRROR_BVH',len(vertices),len(faces),len(triangles),flush=True);bvh=BVHTree.FromPolygons(vertices,faces,all_triangles=True)
del vertices,faces
report={'sourceSha256':manifest['sourceSha256'],'method':'One source-scene specular ray bounce; unfold geometric path length into capture-camera axial Z','views':[]}
def matrix(values):return np.array(values).reshape(4,4).T
def source_point(p):return Vector((p[0],-p[2],p[1]))
for view in manifest['views']:
 if view['id'] not in a.views.split(','):continue
 image=bpy.data.images.load(str(pack/view['depth']),check_existing=False);image.colorspace_settings.name='Non-Color'
 w,h=image.size;rgba=np.empty(w*h*4,dtype=np.float32);image.pixels.foreach_get(rgba);pixels=rgba.reshape(h,w,4)[::-1]
 depth=(np.rint(pixels[:,:,0]*255)*256+np.rint(pixels[:,:,1]*255))/65535*64;optical=depth.copy()
 camera=matrix(view['cameraMatrix']);projection=matrix(view['projectionMatrix']);inverse=np.linalg.inv(projection);origin=camera[:3,3]
 xx,yy=np.meshgrid((np.arange(w)+.5)/w*2-1,1-(np.arange(h)+.5)/h*2)
 rays=np.stack([xx,yy,np.full_like(xx,-1),np.ones_like(xx)],axis=-1)@inverse.T;rays=rays[:,:,:3]/-rays[:,:,2,None];rays=rays@camera[:3,:3].T
 changed=np.zeros((h,w),dtype=bool)
 view_projection=projection@np.linalg.inv(camera)
 for triangle in triangles:
  clip=np.column_stack([triangle,np.ones(3)])@view_projection.T
  if np.any(clip[:,3]<=0):continue
  projected=clip[:,:2]/clip[:,3,None];px=(projected[:,0]*.5+.5)*w;py=(.5-projected[:,1]*.5)*h
  left=max(0,int(np.floor(px.min())));right=min(w,int(np.ceil(px.max())));top=max(0,int(np.floor(py.min())));bottom=min(h,int(np.ceil(py.max())))
  if right<=left or bottom<=top:continue
  selected=np.s_[top:bottom,left:right];local_rays=rays[selected]
  u,v=triangle[1]-triangle[0],triangle[2]-triangle[0];normal=np.cross(u,v);length=np.linalg.norm(normal)
  if length<1e-12:continue
  normal/=length
  denominator=local_rays@normal
  with np.errstate(divide='ignore',invalid='ignore'):distance=((triangle[0]-origin)@normal)/denominator
  candidates=(np.abs(distance-depth[selected])<.025)&(distance>0)&~changed[selected]
  if not candidates.any():continue
  points=origin+local_rays*distance[:,:,None];q=points-triangle[0];uu=u@u;uv=u@v;vv=v@v;divisor=uu*vv-uv*uv
  if abs(divisor)<1e-14:continue
  b=(vv*(q@u)-uv*(q@v))/divisor;c=(uu*(q@v)-uv*(q@u))/divisor
  mask=candidates&(b>=-1e-6)&(c>=-1e-6)&(b+c<=1.000001)
  for row,col in np.argwhere(mask):
   direction=local_rays[row,col];length=np.linalg.norm(direction);direction=direction/length;reflected=direction-2*(direction@normal)*normal
   point=points[row,col];start=point+reflected*.002;location,n,index,ray_length=bvh.ray_cast(source_point(start),source_point(reflected),128)
   if location is not None:
    optical[row+top,col+left]=min(64,float(distance[row,col])+np.linalg.norm(np.array([location.x,location.z,-location.y])-point)/length);changed[row+top,col+left]=True
 optical.astype(np.float32).tofile(out/(view['id']+'-optical.bin'))
 record={'id':view['id'],'width':w,'height':h,'reflectedPixels':int(changed.sum()),'maximumVirtualZ':float(optical.max())};report['views'].append(record);print('MIRROR_DEPTH',record,flush=True)
(out/'optical.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
