import * as T from 'three';

// A small live photographic subject. The room stays pre-rendered; only this
// stationary tabletop appliance needs geometry and an animated rotor.
export function createDeskFan(config,lookToward){
  const group=new T.Group();group.position.fromArray(config.position);
  group.rotation.y=Math.atan2(lookToward.x-group.position.x,lookToward.z-group.position.z);
  const shell=new T.MeshStandardMaterial({color:0x536a5c,metalness:.2,roughness:.36});
  const wire=new T.MeshStandardMaterial({color:0x8d9286,metalness:.8,roughness:.31});
  const brass=new T.MeshStandardMaterial({color:0xbda06a,metalness:.68,roughness:.32});
  const rubber=new T.MeshStandardMaterial({color:0x171b18,roughness:.92});
  const add=(parent,geometry,material,x=0,y=0,z=0)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  const base=add(group,new T.SphereGeometry(1,32,12),shell,0,.025,0);base.scale.set(.112,.026,.093);
  const foot=add(group,new T.CylinderGeometry(.09,.094,.008,32),rubber,0,.005,0);foot.scale.z=.8;
  add(group,new T.CylinderGeometry(.022,.028,.24,20),shell,0,.16,0);
  add(group,new T.SphereGeometry(.035,20,12),brass,0,.30,0);
  const head=new T.Group();head.position.set(0,.435,0);head.rotation.x=-.09;group.add(head);
  const motor=add(head,new T.CylinderGeometry(.065,.073,.13,24),shell,0,0,-.048);motor.rotation.x=Math.PI/2;
  const radius=.19;
  for(const z of [-.026,.064]){
    const rim=add(head,new T.TorusGeometry(radius+.012,.004,8,64),shell,0,0,z);
    rim.name='Fan guard rim';
  }
  for(const r of [.055,.09,.125,.16,.193]){
    const z=.07+.035*Math.sqrt(Math.max(0,1-(r/.205)**2));
    add(head,new T.TorusGeometry(r,.0015,4,64),wire,0,0,z);
  }
  for(let i=0;i<20;i++){
    const angle=i*Math.PI*2/20,points=[];
    for(let j=0;j<=8;j++){const r=.035+(.17*j/8),z=.064+.04*Math.sqrt(Math.max(0,1-(r/.205)**2));points.push(new T.Vector3(Math.cos(angle)*r,Math.sin(angle)*r,z));}
    add(head,new T.TubeGeometry(new T.CatmullRomCurve3(points),8,.00135,4,false),wire);
  }
  const rotor=new T.Group();head.add(rotor);
  const shape=new T.Shape();shape.moveTo(.025,-.018);shape.bezierCurveTo(.07,-.068,.158,-.075,.182,-.018);shape.bezierCurveTo(.205,.041,.14,.097,.085,.069);shape.bezierCurveTo(.04,.049,.025,.016,.025,-.018);
  const bladeGeometry=new T.ExtrudeGeometry(shape,{depth:.006,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2,curveSegments:16});
  for(let i=0;i<3;i++){const blade=add(rotor,bladeGeometry,brass,0,0,.018);blade.rotation.z=i*Math.PI*2/3;}
  const hub=add(rotor,new T.SphereGeometry(.041,24,16),brass,0,0,.035);hub.scale.z=.55;
  const badge=add(head,new T.CylinderGeometry(.027,.027,.007,24),shell,0,0,.112);badge.rotation.x=Math.PI/2;
  // A soft contact shadow anchors the small base to the sampled real tabletop.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;
  const context=shadowCanvas.getContext('2d'),gradient=context.createRadialGradient(32,32,3,32,32,31);gradient.addColorStop(0,'rgba(0,0,0,.42)');gradient.addColorStop(1,'rgba(0,0,0,0)');context.fillStyle=gradient;context.fillRect(0,0,64,64);
  const shadow=add(group,new T.PlaneGeometry(.30,.25),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}),0,.001,0);shadow.rotation.x=-Math.PI/2;shadow.renderOrder=2;
  shadow.userData.focusable=false;
  return {group,rotor,head,period:1/(3*config.rotationsPerSecond),setTime(time){rotor.rotation.z=time*Math.PI*2*config.rotationsPerSecond;},
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
