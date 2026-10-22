"""Generate the shared atlas outside Blender's native-library process."""
import argparse,pathlib,sys
p=argparse.ArgumentParser();p.add_argument('work');p.add_argument('--size',type=int,default=2048);p.add_argument('--python-deps')
a=p.parse_args()
if a.python_deps:sys.path.insert(0,str(pathlib.Path(a.python_deps).resolve()))
import numpy as np,xatlas
work=pathlib.Path(a.work);positions=np.fromfile(work/'positions.bin',dtype=np.float32).reshape(-1,3)
vertices,inverse=np.unique(positions,axis=0,return_inverse=True);triangles=inverse.reshape(-1,3).astype(np.uint32)
edges=vertices[triangles[:,1:]]-vertices[triangles[:,0,None]];valid=np.linalg.norm(np.cross(edges[:,0],edges[:,1]),axis=1)>1e-10
print('ATLAS_INPUT',len(vertices),int(valid.sum()),flush=True)
atlas=xatlas.Atlas();atlas.add_mesh(vertices,triangles[valid]);pack=xatlas.PackOptions();pack.resolution=a.size;pack.padding=4
print('ATLAS_GENERATE',flush=True);atlas.generate(pack_options=pack)
mapping,indices,coordinates=atlas[0];mapped=np.zeros((len(triangles),3,2),dtype=np.float32);mapped[valid]=coordinates[indices]
mapped.tofile(work/'uv.bin');valid.tofile(work/'valid.bin');print('ATLAS_COMPLETE',atlas.width,atlas.height,flush=True)
