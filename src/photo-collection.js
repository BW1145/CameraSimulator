/** Compute eviction without changing the collection or releasing any resource.
 * Callers commit this result only after all fallible work (e.g. URL creation).
 */
export function planPhotoAddition(shots,shot,{protectedIds=new Set(),maxShots=8,maxBytes=64*1024*1024}={}){
  if(shot.blob.size>maxBytes)throw new Error('这张照片超过临时存储上限，请重试');
  const kept=[...shots],removed=[];
  let bytes=kept.reduce((total,item)=>total+item.blob.size,shot.blob.size);
  while(kept.length>=maxShots||bytes>maxBytes){
    const index=kept.findIndex(item=>!protectedIds.has(item.id));
    if(index<0)throw new Error('临时存储已满，请先关闭回看或完成下载后再拍摄');
    const [item]=kept.splice(index,1);bytes-=item.blob.size;removed.push(item);
  }
  return {kept,removed,bytes};
}
