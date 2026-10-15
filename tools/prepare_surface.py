"""Resample a superior atlas patch into a continuous, collidable surgical surface."""
from pathlib import Path
import gzip,base64,zlib,xml.etree.ElementTree as E
import numpy as np
from scipy.ndimage import gaussian_filter,distance_transform_edt
def arrays(path):
 root=E.fromstring(gzip.decompress(Path(path).read_bytes()));out=[]
 for a in root.findall('DataArray'):
  dtype='<f4' if 'FLOAT32' in a.attrib['DataType'] else '<i4'
  out.append(np.frombuffer(zlib.decompress(base64.b64decode(a.find('Data').text)),dtype=dtype).reshape(tuple(int(a.attrib['Dim'+str(i)]) for i in range(int(a.attrib['Dimensionality'])))))
 return out
v,faces=arrays('/tmp/pial_left.gii.gz')
n=181
xs=np.linspace(-1.88,1.88,n);ys=np.linspace(-1.6,1.6,n)
p=np.column_stack(((v[:,0]+28)*.073,(v[:,1]+28)*.073,(v[:,2]-73)*.021))
height=np.full((n,n),-np.inf)
for face in faces:
 t=p[face];lo=np.floor((t[:,:2].min(axis=0)-[-1.88,-1.6])/[3.76,3.2]*(n-1)).astype(int);hi=np.ceil((t[:,:2].max(axis=0)-[-1.88,-1.6])/[3.76,3.2]*(n-1)).astype(int)
 lo=np.maximum(lo,0);hi=np.minimum(hi,n-1)
 if np.any(lo>hi):continue
 x,y=np.meshgrid(xs[lo[0]:hi[0]+1],ys[lo[1]:hi[1]+1]);a,b,c=t
 den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
 if abs(den)<1e-10:continue
 wa=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den
 wb=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den
 wc=1-wa-wb
 z=wa*a[2]+wb*b[2]+wc*c[2];z=np.where((wa>=-1e-6)&(wb>=-1e-6)&(wc>=-1e-6),z,-np.inf)
 target=height[lo[1]:hi[1]+1,lo[0]:hi[0]+1];np.maximum(target,z,out=target)
missing=~np.isfinite(height)
near=distance_transform_edt(missing,return_distances=False,return_indices=True)
height[missing]=height[tuple(near[:,missing])]
height=gaussian_filter(height,.75)
vertices=[];triangles=[]
for j,y in enumerate(ys):
 for i,x in enumerate(xs):
  vertices.append([float(x),float(y),float(height[j,i])])
  if i<n-1 and j<n-1:
   k=j*n+i
   if x*x/(1.88**2)+y*y/(1.6**2)<1.025:triangles.extend([[k,k+1,k+n],[k+1,k+n+1,k+n]])
import json
Path('/tmp/suture-surface.json').write_text(json.dumps({'vertices':vertices,'faces':triangles}))
print('Prepared continuous atlas patch',len(vertices),'vertices',len(triangles),'faces')
