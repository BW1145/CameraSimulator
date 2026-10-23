import {addPhotoMetadata} from './photo-metadata.js';
export function exportDimensions(width,height,longEdge=2048) {
  if(!Number.isFinite(longEdge)||longEdge<1)throw new Error('无效的导出尺寸');
  const scale=Math.min(1,longEdge/Math.max(width,height));
  return [Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale))];
}
export function canvasBlob(canvas,type='image/png',quality) {
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('照片编码失败，请重试')),type,quality));
}
// Decode only the stored lossless master, never the live renderer canvas. JPEG
// is encoded exactly once; a full-size PNG reuses the original encoded pixels.
export async function exportPhoto(shot,{format='jpeg',longEdge=2048,quality=.92}={}) {
  if(!['jpeg','png'].includes(format))throw new Error('不支持的图片格式');
  if(!Number.isFinite(quality)||quality<.1||quality>1)throw new Error('无效的图片质量');
  const [width,height]=exportDimensions(shot.width,shot.height,longEdge);
  let encoded=shot.blob;
  if(format!=='png'||width!==shot.width||height!==shot.height) {
    const image=await createImageBitmap(shot.blob);
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    try {
      const context=canvas.getContext('2d');if(!context)throw new Error('无法创建导出画布');
      context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,width,height);
      encoded=await canvasBlob(canvas,`image/${format}`,quality);
      if(encoded.type!==`image/${format}`)throw new Error('浏览器不支持所选图片格式');
    } finally {image.close();canvas.width=canvas.height=1;}
  }
  return new Blob([await addPhotoMetadata(new Uint8Array(await encoded.arrayBuffer()),format,shot.snapshot,width,height)],{type:`image/${format}`});
}
