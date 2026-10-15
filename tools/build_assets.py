"""Author the prototype's 3D assets. Run with Blender --background --python.

Modified atlas: FreeSurfer fsaverage5, distributed by Nilearn. See public/licenses.
The instruments and operating-field additions are original simplified game art.
"""
import bpy
import gzip
import base64
import zlib
import xml.etree.ElementTree as ET
import math
import random
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models'
OUT.mkdir(parents=True, exist_ok=True)

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def material(name, color, metal=0.0, rough=0.35):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color,1)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    return m

def export(name):
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name+'.glb')),export_format='GLB',export_yup=False)

def arrays(path):
    import numpy as np
    root=ET.fromstring(gzip.decompress(Path(path).read_bytes()))
    result=[]
    for a in root.findall('DataArray'):
        data=zlib.decompress(base64.b64decode(a.find('Data').text))
        dtype='<f4' if 'FLOAT32' in a.attrib['DataType'] else '<i4'
        shape=tuple(int(a.attrib['Dim'+str(i)]) for i in range(int(a.attrib['Dimensionality'])))
        result.append(np.frombuffer(data,dtype=dtype).reshape(shape))
    return result

clear()
patch=json.loads(Path('/tmp/suture-surface.json').read_text())
coords=patch['vertices'];faces=patch['faces']
mesh=bpy.data.meshes.new('atlas_cortical_surface')
mesh.from_pydata(coords,[],faces)
mesh.update()
obj=bpy.data.objects.new('cortex',mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj
col=mesh.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='POINT')
random.seed(41)
for i,d in enumerate(col.data):
    x,y,z=coords[i];tone=.88+.04*math.sin(x*8+y*6)+.025*math.sin(x*29-y*23)
    d.color=(.59*tone,.325*tone,.27*tone,1)
for p in mesh.polygons:p.use_smooth=True
mat=material('Atlas cortex — modified game material',(.64,.32,.255),0,.37)
nodes=mat.node_tree.nodes
color=nodes.new('ShaderNodeVertexColor');color.layer_name='Col'
mat.node_tree.links.new(color.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
obj.data.materials.append(mat)
export('cortex')

def tube(name, points, radii, mat, sides=16):
    vs=[];fs=[]
    for i,p in enumerate(points):
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        tangent.normalize()
        normal=tangent.cross(Vector((0,1,0))).normalized()
        if normal.length<.1:normal=Vector((0,0,1))
        bitangent=tangent.cross(normal).normalized()
        for j in range(sides):
            a=j*math.tau/sides
            vs.append(Vector(p)+(normal*math.cos(a)+bitangent*math.sin(a))*radii[i])
    for i in range(len(points)-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides
            fs.append((a,b,b+sides,a+sides))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)
    for p in mesh.polygons:p.use_smooth=True
    return o

def cylinder(name, x, radius, length, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=radius,depth=length,location=(x,0,.16),rotation=(0,math.pi/2,0))
    o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    bevel=o.modifiers.new('Machined edges','BEVEL');bevel.width=.006;bevel.segments=2
    for p in o.data.polygons:p.use_smooth=True
    return o

for kind in ['suction','irrigation','bipolar']:
    clear()
    steel=material('Brushed surgical steel',(.46,.53,.56),.93,.24)
    dark=material('Dark lumen',(.008,.012,.012),.25,.35)
    black=material('Insulated instrument finish',(.025,.033,.036),.55,.3)
    gold=material('Irrigation connector',(.55,.38,.12),.75,.3)
    if kind!='bipolar':
        radius=.035 if kind=='suction' else .022
        pts=[(0,0,0),(.07,0,.005),(.16,0,.02),(.26,0,.07),(.36,0,.13),(.48,0,.16),(2.3,0,.16)]
        tube('tubular working shaft',pts,[radius]*len(pts),steel,24)
        tube('open suction lumen',[(.002,0,0),(.018,0,.001)],[radius*.72]*2,dark,24)
        for x,r,l,m in [(2.1,.07,.2,steel),(2.4,.086,.42,steel),(2.79,.071,.35,steel),(3.05,.095,.18,gold if kind=='irrigation' else steel)]:
            cylinder('machined handle',x,r,l,m)
        for j in range(15):cylinder('grip ring',2.23+j*.043,.089 if j<10 else .074,.013,steel)
    else:
        for side in [-1,1]:
            points=[(0,side*.025,0),(.2,side*.033,.012),(.5,side*.065,.06),(1.0,side*.12,.14),(1.7,side*.13,.16),(2.3,side*.09,.16),(2.55,0,.16)]
            tube('bipolar tine '+str(side),points,[.012,.014,.021,.03,.035,.045,.045],steel,16)
            tube('insulated grip '+str(side),[(.75,side*.09,.115),(1.2,side*.13,.16),(2.3,side*.09,.16)],[.03,.045,.05],black,16)
        cylinder('bipolar connector',2.7,.1,.35,black)
        cylinder('cable attachment',2.94,.065,.16,steel)
    export(kind)

print('SUTURE: atlas and three original instrument assets exported')
