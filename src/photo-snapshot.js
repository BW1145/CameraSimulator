// Snapshot only serializable simulator state. No live renderer references or user data.
function freeze(value) {
  if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
export function photoSnapshot({settings,resolved,scene,renderer,simulationTime,focusPoint,width,height,capturedAt=new Date().toISOString()}) {
  const source=renderer.plateMode?{
    kind:'photographic-plate',pack:renderer.pack?.title??null,
    sourceSha256:renderer.pack?.sourceSha256??null,referenceFocal:renderer.pack?.referenceFocal??null,viewId:renderer.entry?.id??null,
    imageWidth:renderer.plate?.image?.image?.width??null,imageHeight:renderer.plate?.image?.image?.height??null,
    detailLoaded:Boolean(renderer.entry?.detailWidth&&renderer.plate?.image?.image?.width>=renderer.entry.detailWidth),
    flashLayerLoaded:Boolean(renderer.plate?.flash),fanPresent:Boolean(renderer.fan),
  }:{kind:'gltf',viewId:null};
  return freeze(structuredClone({schemaVersion:1,software:'CameraSimulator',simulated:true,capturedAt,
    settings,resolved,scene:{id:scene.id,name:scene.name},source,simulationTime,focusPoint,width,height,
    rendering:{sourceView:Boolean(renderer.sourceView),exposureOffset:renderer.exposureOffset??0,filmWidth:renderer.filmWidth??null,
      ...(renderer.displayTransform?{displayTransform:renderer.displayTransform}:{}),
      cameraPosition:renderer.camera?.position?.toArray()??null,cameraQuaternion:renderer.camera?.quaternion?.toArray()??null,overlaysIncluded:false}}));
}
export function assertCaptureLayers(renderer,settings) {
  if(renderer.plateMode && settings.flash>0 && !renderer.plate?.flash)
    throw new Error('补光图层未就绪，请重试加载后拍照');
}
