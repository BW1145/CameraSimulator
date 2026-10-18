import * as T from 'three';

// A small live photographic subject. The room stays pre-rendered; only this
// stationary tabletop appliance needs geometry and an animated rotor.
export function createDeskFan(config,lookToward){
  const group=new T.Group();group.position.fromArray(config.position);
  group.rotation.y=Math.atan2(lookToward.x-group.position.x,lookToward.z-group.position.z);
  // Fine, deterministic surface variation catches the room's reflected lights
  // without painting illumination onto the fan or changing its exposure.
  const finishCanvas=document.createElement('canvas');finishCanvas.width=128;finishCanvas.height=128;
  const finishContext=finishCanvas.getContext('2d'),finishPixels=finishContext.createImageData(128,128);
  let seed=7919;for(let i=0;i<finishPixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=180+(seed>>>27);finishPixels.data[i]=finishPixels.data[i+1]=finishPixels.data[i+2]=n;finishPixels.data[i+3]=255;}
  finishContext.putImageData(finishPixels,0,0);
  const finish=new T.CanvasTexture(finishCanvas);finish.wrapS=finish.wrapT=T.RepeatWrapping;finish.repeat.set(3,3);finish.colorSpace=T.NoColorSpace;
  const shell=new T.MeshPhysicalMaterial({color:0x465d50,metalness:.38,roughness:.44,clearcoat:.32,clearcoatRoughness:.28,bumpMap:finish,bumpScale:.00012,roughnessMap:finish,envMapIntensity:1.1});
  // Painted steel wire has a broad, restrained highlight. Chrome-like F0 on
  // subpixel tubes produced white specular beads instead of a resolved grille.
  const wire=new T.MeshPhysicalMaterial({color:0x3e4b42,metalness:.2,roughness:.68,specularIntensity:.25,envMapIntensity:.6});
  const brass=new T.MeshStandardMaterial({color:0x9b713c,metalness:.88,roughness:.39,bumpMap:finish,bumpScale:.00005,roughnessMap:finish,envMapIntensity:1.2});
  const darkMetal=new T.MeshStandardMaterial({color:0x333c34,metalness:.65,roughness:.4});
  const rubber=new T.MeshStandardMaterial({color:0x242722,roughness:.94});
  const add=(parent,geometry,material,x=0,y=0,z=0)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  // A rolled, flat-bottomed metal base rests on three discrete rubber feet.
  // The former full-radius rubber cylinder read as a floating black ring.
  const profile=[[0,.006],[.107,.006],[.11,.009],[.108,.014],[.096,.023],[.075,.036],[.05,.044],[.025,.047],[0,.047]].map(([r,y])=>new T.Vector2(r,y));
  const base=add(group,new T.LatheGeometry(profile,64),shell);base.scale.z=.83;
  for(const angle of [Math.PI/2,Math.PI*7/6,Math.PI*11/6])add(group,new T.CylinderGeometry(.012,.013,.006,16),rubber,Math.cos(angle)*.073,.003,Math.sin(angle)*.061);
  const baseSeam=add(group,new T.TorusGeometry(.106,.0012,6,64),darkMetal,0,.009,0);baseSeam.rotation.x=Math.PI/2;baseSeam.scale.y=.83;
  add(group,new T.CylinderGeometry(.019,.026,.245,32),shell,0,.168,0);
  add(group,new T.CylinderGeometry(.028,.029,.014,32),shell,0,.049,0);
  add(group,new T.CylinderGeometry(.023,.023,.008,24),brass,0,.288,0);
  add(group,new T.SphereGeometry(.035,20,12),brass,0,.30,0);
  const head=new T.Group();head.position.set(0,.435,0);head.rotation.x=-.09;group.add(head);
  const motor=add(head,new T.CylinderGeometry(.065,.073,.13,24),shell,0,0,-.048);motor.rotation.x=Math.PI/2;
  const motorBack=add(head,new T.SphereGeometry(.065,32,16),shell,0,0,-.113);motorBack.scale.z=.42;
  for(const z of [-.104,-.094,-.084])add(head,new T.TorusGeometry(.064,.0015,6,48),darkMetal,0,0,z);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;const vent=add(head,new T.BoxGeometry(.003,.017,.001),darkMetal,Math.cos(a)*.044,Math.sin(a)*.044,-.136);vent.rotation.z=a-Math.PI/2;}
  const radius=.19;
  const grille=[];
  for(const z of [-.026,.064]){
    const rim=add(head,new T.TorusGeometry(radius+.012,.004,8,64),wire,0,0,z);
    rim.name='Fan guard rim';
  }
  for(const r of [.055,.09,.125,.16,.193]){
    const z=.07+.035*Math.sqrt(Math.max(0,1-(r/.205)**2));
    grille.push({mesh:add(head,new T.TorusGeometry(r,.0015,8,64),wire,0,0,z),medium:[.09,.16,.193].includes(r)});
  }
  for(let i=0;i<20;i++){
    const angle=i*Math.PI*2/20,points=[];
    for(let j=0;j<=8;j++){const r=.035+(.17*j/8),z=.064+.04*Math.sqrt(Math.max(0,1-(r/.205)**2));points.push(new T.Vector3(Math.cos(angle)*r,Math.sin(angle)*r,z));}
    grille.push({mesh:add(head,new T.TubeGeometry(new T.CatmullRomCurve3(points),8,.00135,6,false),wire),medium:i%2===0});
  }
  // Below a pixel, individual wires should contribute average coverage rather
  // than sparkle. This disk is the spatially averaged unresolved grille, with
  // actual mesh restored as soon as the projected head can resolve it.
  const grilleAverage=add(head,new T.CircleGeometry(.193,64),new T.MeshBasicMaterial({color:0x303b34,transparent:true,opacity:.18,depthWrite:false}),0,0,.106);
  grilleAverage.userData.focusable=false;
  const rotor=new T.Group();head.add(rotor);
  // A thin, closed blade with an actual cambered and twisted surface. A flat
  // extruded shape has one face normal, making its entire face a painted disc.
  const positions=[],uvs=[],indices=[],rows=20,columns=16;
  for(let side=0;side<2;side++)for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++){
    const t=i/rows,v=j/columns,u=v*2-1,r=.027+.157*t;
    const angle=-.35+.58*t+u*(.12+.49*Math.pow(Math.sin(Math.PI*t),.65));
    positions.push(r*Math.cos(angle),r*Math.sin(angle),.018+.025*u*t+.014*Math.sin(Math.PI*t)*(1-u*u)+(side?-.0015:.0015));uvs.push(t,v);
  }
  const layer=(rows+1)*(columns+1),stride=columns+1;
  for(let side=0;side<2;side++)for(let i=0;i<rows;i++)for(let j=0;j<columns;j++){
    const a=side*layer+i*stride+j,b=a+stride,c=b+1,d=a+1;
    if(side)indices.push(a,c,b,a,d,c);else indices.push(a,b,c,a,c,d);
  }
  const close=(a,b)=>indices.push(a,b,b+layer,a,b+layer,a+layer);
  for(let i=0;i<rows;i++){close(i*stride,(i+1)*stride);close((i+1)*stride+columns,i*stride+columns);}
  for(let j=0;j<columns;j++){close(j+1,j);close(rows*stride+j,rows*stride+j+1);}
  const bladeGeometry=new T.BufferGeometry();bladeGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));bladeGeometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));bladeGeometry.setIndex(indices);bladeGeometry.computeVertexNormals();
  for(let i=0;i<3;i++){const blade=add(rotor,bladeGeometry,brass);blade.rotation.z=i*Math.PI*2/3;}
  const hub=add(rotor,new T.SphereGeometry(.041,24,16),brass,0,0,.035);hub.scale.z=.55;
  const badge=add(head,new T.CylinderGeometry(.027,.027,.007,24),shell,0,0,.112);badge.rotation.x=Math.PI/2;
  add(head,new T.TorusGeometry(.027,.0012,6,32),brass,0,0,.116);
  for(const x of [-.012,.012]){const screw=add(head,new T.SphereGeometry(.002,8,6),brass,x,0,.117);screw.scale.z=.35;}
  // A soft contact shadow anchors the small base to the sampled real tabletop.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
  const context=shadowCanvas.getContext('2d'),gradient=context.createRadialGradient(64,64,0,64,64,63);
  gradient.addColorStop(0,'rgba(0,0,0,.22)');gradient.addColorStop(.38,'rgba(0,0,0,.17)');gradient.addColorStop(.7,'rgba(0,0,0,.055)');gradient.addColorStop(1,'rgba(0,0,0,0)');context.fillStyle=gradient;context.fillRect(0,0,128,128);
  // Slightly above the table's millimetre-quantized Z avoids stippled z-fighting.
  // The darker central area is naturally covered by the solid base.
  const shadow=add(group,new T.PlaneGeometry(.34,.29),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),.012,.003,.007);shadow.rotation.x=-Math.PI/2;shadow.renderOrder=2;
  shadow.userData.focusable=false;
  return {group,rotor,head,period:1/(3*config.rotationsPerSecond),setTime(time){rotor.rotation.z=time*Math.PI*2*config.rotationsPerSecond;},
    setQuality(camera,width,height){
      const bounds=this.bounds(camera,width,height),r=bounds?Math.max(bounds.width,bounds.height)/2-3:0;
      for(const item of grille)item.mesh.visible=r>=40||(r>=12&&item.medium);
      grilleAverage.visible=r<40;grilleAverage.material.opacity=r<12?.18:.07;
    },
    center(){group.updateMatrixWorld(true);return head.getWorldPosition(new T.Vector3());},
    bounds(camera,width,height){
      group.updateMatrixWorld(true);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(const x of [-.21,.21])for(const y of [-.21,.21])for(const z of [-.015,.045]){
        const p=new T.Vector3(x,y,z).applyMatrix4(head.matrixWorld).project(camera);minX=Math.min(minX,(p.x*.5+.5)*width);maxX=Math.max(maxX,(p.x*.5+.5)*width);minY=Math.min(minY,(p.y*.5+.5)*height);maxY=Math.max(maxY,(p.y*.5+.5)*height);
      }
      const x=Math.max(0,Math.floor(minX)-3),y=Math.max(0,Math.floor(minY)-3),right=Math.min(width,Math.ceil(maxX)+3),top=Math.min(height,Math.ceil(maxY)+3);
      return right>x&&top>y?{x,y,width:right-x,height:top-y}:null;
    }};
}
