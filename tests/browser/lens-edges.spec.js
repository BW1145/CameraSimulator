import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../src/renderer.js',import.meta.url),'utf8');
const fragment=source.match(/const fragment=`([\s\S]*?)`;/)[1].replace('#include <tonemapping_pars_fragment>','vec3 AgXToneMapping(vec3 c){return c;}');

test('GPU lens preserves focused foreground, softens near silhouettes and scales with export pixels',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(fragment=>{
    const draw=(width,focus,aperture,{focal=120,nearZ=2,farZ=8,sensorWidth=36}={})=>{
      const height=width/2,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true});
      if(!gl.getExtension('OES_texture_float'))throw Error('Float texture unavailable');
      const shader=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
      const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const attr=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
      const color=new Float32Array(width*height*4),depth=new Float32Array(width*height*4);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=(y*width+x)*4,z=x<width/2?nearZ:farZ;
        color[i]=x<width/2?.2:0;color[i+2]=x<width/2?0:.2;color[i+3]=1;
        depth[i]=(150-.03*150/z)/(150-.03);depth[i+3]=1;
      }
      for(const [unit,name,data] of [[0,'plate',color],[1,'sceneDepth',depth]]){
        const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.FLOAT,data);gl.uniform1i(gl.getUniformLocation(program,name),unit);
      }
      for(const [name,value]of Object.entries({focus,focal,aperture,exposure:0,iso:0,wb:5000,time:0,sensorWidth,nearClip:.03,farClip:150,radianceScale:1}))gl.uniform1f(gl.getUniformLocation(program,name),value);
      gl.uniform2f(gl.getUniformLocation(program,'resolution'),width,height);gl.viewport(0,0,width,height);gl.drawArrays(gl.TRIANGLES,0,6);const pixels=new Uint8Array(width*4);gl.readPixels(0,height/2,width,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const red=Array.from({length:width},(_,x)=>pixels[x*4]);const blue=Array.from({length:width},(_,x)=>pixels[x*4+2]);gl.getExtension('WEBGL_lose_context')?.loseContext();return {red,blue};
    };
    const sharp=draw(512,2,1.4),blur=draw(512,8,1.4),large=draw(1024,8,1.4),stopped=draw(512,8,16);
    const extent=(p,threshold)=>p.red.reduce((last,v,i)=>v>threshold?i:last,0)-p.red.length/2;
    const preview=draw(732,3,1.4,{focal:100,nearZ:9,farZ:9,sensorWidth:22.6}),exported=draw(2048,3,1.4,{focal:100,nearZ:9,farZ:9,sensorWidth:22.6});
    return {previewExtent:extent(preview,10),exportExtent:extent(exported,10),sharpNearBlue:Math.max(...sharp.blue.slice(200,256)),blurOuterRed:blur.red[260],stoppedOuterRed:stopped.red[260],smallExtent:extent(blur,10),largeExtent:extent(large,10),blurEdge:blur.red.slice(248,272)};
  },fragment);
  console.log('GPU lens fixture',JSON.stringify(result));
  expect(result.exportExtent).toBeGreaterThan(50);expect(Math.abs(result.exportExtent*732/2048-result.previewExtent)).toBeLessThan(2);
  expect(result.sharpNearBlue).toBeLessThan(3);
  expect(result.blurOuterRed).toBeGreaterThan(10);
  expect(result.stoppedOuterRed).toBeLessThan(result.blurOuterRed);
  expect(Math.abs(result.largeExtent/2-result.smallExtent)).toBeLessThan(2);
});
