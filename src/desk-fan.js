import * as T from 'three';

// Live vintage fan: geometry and response to the source HDR remain physical.
// No original rendered fan pixels are used by this model.
export function createDeskFan(config,lookToward){
  const group=new T.Group();group.position.fromArray(config.position);
  group.rotation.y=Math.atan2(lookToward.x-group.position.x,lookToward.z-group.position.z)+(config.yawOffset??0);
  // Fine, deterministic surface variation catches the room's reflected lights
  // without painting illumination onto the fan or changing its exposure.
  const finishCanvas=document.createElement('canvas');finishCanvas.width=128;finishCanvas.height=128;
  const finishContext=finishCanvas.getContext('2d'),finishPixels=finishContext.createImageData(128,128);
  let seed=7919;for(let i=0;i<finishPixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=180+(seed>>>27);finishPixels.data[i]=finishPixels.data[i+1]=finishPixels.data[i+2]=n;finishPixels.data[i+3]=255;}
  finishContext.putImageData(finishPixels,0,0);
  const finish=new T.CanvasTexture(finishCanvas);finish.wrapS=finish.wrapT=T.RepeatWrapping;finish.repeat.set(3,3);finish.colorSpace=T.NoColorSpace;
  // Black enamel is a dielectric paint over steel, not a green-tinted metal.
  // Its broad clearcoat reflects the room while shadow-facing paint stays dark.
  const shell=new T.MeshPhysicalMaterial({color:0x141713,metalness:.04,roughness:.50,specularIntensity:.65,clearcoat:.08,clearcoatRoughness:.32,bumpMap:finish,bumpScale:.000035,roughnessMap:finish,envMapIntensity:1});
  // Painted steel wire has a broad, restrained highlight. Chrome-like F0 on
  // subpixel tubes produced white specular beads instead of a resolved grille.
  const wire=new T.MeshPhysicalMaterial({color:0x101311,metalness:.08,roughness:.43,specularIntensity:.7,clearcoat:.06,clearcoatRoughness:.3,envMapIntensity:1});
  const hardware=new T.MeshStandardMaterial({color:0x85857e,metalness:.9,roughness:.4,bumpMap:finish,bumpScale:.000025,roughnessMap:finish,envMapIntensity:1});
  const bladeMetal=new T.MeshPhysicalMaterial({color:0x595b55,metalness:.92,roughness:.53,anisotropy:.28,anisotropyRotation:Math.PI/2,bumpMap:finish,bumpScale:.000018,roughnessMap:finish,envMapIntensity:1});
  const darkMetal=new T.MeshStandardMaterial({color:0x333c34,metalness:.65,roughness:.4});
  const rubber=new T.MeshStandardMaterial({color:0x242722,roughness:.94});
  const add=(parent,geometry,material,x=0,y=0,z=0)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  // A rolled, flat-bottomed metal base rests on three discrete rubber feet.
  // The former full-radius rubber cylinder read as a floating black ring.
  const profile=[[0,.006],[.107,.006],[.11,.009],[.108,.014],[.096,.023],[.075,.036],[.05,.044],[.025,.047],[0,.047]].map(([r,y])=>new T.Vector2(r,y));
  const base=add(group,new T.LatheGeometry(profile,64),shell);base.scale.z=.83;
  for(const angle of [Math.PI/2,Math.PI*7/6,Math.PI*11/6])add(group,new T.CylinderGeometry(.012,.013,.006,16),rubber,Math.cos(angle)*.073,.003,Math.sin(angle)*.061);
  const baseSeam=add(group,new T.TorusGeometry(.106,.0012,6,64),darkMetal,0,.009,0);baseSeam.rotation.x=Math.PI/2;baseSeam.scale.y=.83;
  const headHeight=config.headHeight??.435;
  const neckTop=headHeight-.13;
  add(group,new T.CylinderGeometry(.023,.032,neckTop-.05,32),shell,0,(neckTop+.05)/2,0);
  add(group,new T.CylinderGeometry(.028,.029,.014,32),shell,0,.049,0);
  add(group,new T.CylinderGeometry(.026,.026,.009,24),hardware,0,neckTop-.012,0);
  add(group,new T.SphereGeometry(.038,24,16),shell,0,neckTop,0);
  const head=new T.Group();head.position.set(0,headHeight,0);head.rotation.x=config.headTilt??-.09;head.scale.setScalar(config.headScale??1);group.add(head);
  const motor=add(head,new T.CylinderGeometry(.065,.073,.13,24),shell,0,0,-.048);motor.rotation.x=Math.PI/2;
  const motorBack=add(head,new T.SphereGeometry(.065,32,16),shell,0,0,-.113);motorBack.scale.z=.42;
  for(const z of [-.104,-.094,-.084])add(head,new T.TorusGeometry(.064,.0015,6,48),darkMetal,0,0,z);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;const vent=add(head,new T.BoxGeometry(.003,.017,.001),darkMetal,Math.cos(a)*.044,Math.sin(a)*.044,-.136);vent.rotation.z=a-Math.PI/2;}
  const radius=.19;
  const grille=[];
  // A sparse swept safety cage follows the reference appliance's silhouette.
  // The wires are genuine curved tubes, so highlights and occlusion change
  // continuously with camera position instead of becoming an opaque overlay.
  for(const z of [-.026,.056]){
    const rim=add(head,new T.TorusGeometry(radius+.012,.0033,10,96),wire,0,0,z);
    rim.name='Fan guard rim';
  }
  for(let i=0;i<10;i++){
    const angle=i*Math.PI*2/10,points=[];
    for(let j=0;j<=18;j++){
      const t=j/18,r=.034+.167*t;
      const swept=angle+.10*Math.sin(Math.PI*t)-.08*t;
      const z=.056+.058*Math.cos(t*Math.PI/2);
      points.push(new T.Vector3(Math.cos(swept)*r,Math.sin(swept)*r,z));
    }
    grille.push({mesh:add(head,new T.TubeGeometry(new T.CatmullRomCurve3(points),24,.0018,8,false),wire),medium:i%2===0});
    // Rear struts make the cage read as a volume at oblique angles.
    const back=[];for(let j=0;j<=10;j++){
      const t=j/10,r=.065+.136*t;
      back.push(new T.Vector3(Math.cos(angle)*r,Math.sin(angle)*r,-.027-.038*Math.sin(Math.PI*t)));
    }
    add(head,new T.TubeGeometry(new T.CatmullRomCurve3(back),12,.0016,8,false),wire);
  }
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5;
    const clip=add(head,new T.BoxGeometry(.008,.013,.085),shell,Math.cos(a)*.201,Math.sin(a)*.201,.0145);clip.rotation.z=a;
  }
  // Spatial coverage proxy is used only when the actual wires are unresolved.
  const grilleAverage=add(head,new T.CircleGeometry(.193,64),new T.MeshBasicMaterial({color:0x141713,transparent:true,opacity:.045,depthWrite:false}),0,0,.114);
  grilleAverage.userData.focusable=false;
  const rotor=new T.Group();head.add(rotor);
  // A thin, closed blade with an actual cambered and twisted surface. A flat
  // extruded shape has one face normal, making its entire face a painted disc.
  const positions=[],uvs=[],indices=[],rows=20,columns=16;
  for(let side=0;side<2;side++)for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++){
    const t=i/rows,v=j/columns,u=v*2-1,r=.028+t*(.159-.018*u*u);
    // Broad rounded outer edge, modest pitch, and only 4 mm of camber:
    // an actual thin stamped sheet, rather than the inflated spoon-like first try.
    const angle=-.25+.65*t+u*(.06+.62*Math.sin(t*Math.PI/2));
    positions.push(r*Math.cos(angle),r*Math.sin(angle),.012+.024*u*t+.004*Math.sin(Math.PI*t)*(1-u*u)+(side?-.001:.001));uvs.push(t,v);
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
  for(let i=0;i<3;i++){const blade=add(rotor,bladeGeometry,bladeMetal);blade.rotation.z=i*Math.PI*2/3;}
  const hub=add(rotor,new T.SphereGeometry(.041,24,16),bladeMetal,0,0,.035);hub.scale.z=.55;
  const badge=add(head,new T.SphereGeometry(.035,32,20),shell,0,0,.113);badge.scale.z=.22;
  add(head,new T.TorusGeometry(.034,.0008,8,48),wire,0,0,.113);
  for(const x of [-.013,.013]){const screw=add(head,new T.SphereGeometry(.0015,10,8),hardware,x,0,.121);screw.scale.z=.25;}
  // A soft contact shadow anchors the small base to the sampled real tabletop.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
  const context=shadowCanvas.getContext('2d'),gradient=context.createRadialGradient(64,64,0,64,64,63);
  gradient.addColorStop(0,'rgba(0,0,0,.42)');gradient.addColorStop(.38,'rgba(0,0,0,.34)');gradient.addColorStop(.65,'rgba(0,0,0,.22)');gradient.addColorStop(1,'rgba(0,0,0,0)');context.fillStyle=gradient;context.fillRect(0,0,128,128);
  // Slightly above the table's millimetre-quantized Z avoids stippled z-fighting.
  // The darker central area is naturally covered by the solid base.
  const shadow=add(group,new T.PlaneGeometry(.30,.26),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),.012,.003,.007);shadow.rotation.x=-Math.PI/2;shadow.renderOrder=2;
  shadow.userData.focusable=false;
  return {group,rotor,head,period:1/(3*config.rotationsPerSecond),setTime(time){rotor.rotation.z=time*Math.PI*2*config.rotationsPerSecond;},
    setQuality(camera,width,height){
      const bounds=this.bounds(camera,width,height),r=bounds?Math.max(bounds.width,bounds.height)/2-3:0;
      for(const item of grille)item.mesh.visible=r>=40||(r>=12&&item.medium);
      grilleAverage.visible=r<40;grilleAverage.material.opacity=r<12?.045:.022;
    },
    center(){group.updateMatrixWorld(true);return head.getWorldPosition(new T.Vector3());},
    bounds(camera,width,height){
      group.updateMatrixWorld(true);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(const x of [-.21,.21])for(const y of [-.21,.21])for(const z of [-.07,.125]){
        const p=new T.Vector3(x,y,z).applyMatrix4(head.matrixWorld).project(camera);minX=Math.min(minX,(p.x*.5+.5)*width);maxX=Math.max(maxX,(p.x*.5+.5)*width);minY=Math.min(minY,(p.y*.5+.5)*height);maxY=Math.max(maxY,(p.y*.5+.5)*height);
      }
      const x=Math.max(0,Math.floor(minX)-3),y=Math.max(0,Math.floor(minY)-3),right=Math.min(width,Math.ceil(maxX)+3),top=Math.min(height,Math.ceil(maxY)+3);
      return right>x&&top>y?{x,y,width:right-x,height:top-y}:null;
    }};
}
