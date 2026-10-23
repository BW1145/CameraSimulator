const photographicSettings=['focus','focal','wb','sensor','crop','x','y','z','yaw','pitch','roll','flash'];
const exposureSettings=['aperture','shutter','iso','ev'];

// Progressive feedback may outlive a resolution-only asset promotion, never
// a changed photographic intent/crop or a newer committed source generation.
export function canDeliverDetail(snapshot,current){
  if(snapshot.intent!==current.intent||snapshot.regionKey!==current.regionKey)return false;
  const previous=current.committed;
  if(previous?.intent===snapshot.intent&&previous.regionKey===snapshot.regionKey&&
    (previous.generation>snapshot.generation||previous.sourceWidth>snapshot.sourceWidth||previous.sourceDepthWidth>snapshot.sourceDepthWidth))return false;
  if(!current.moving){
    const frame=current.frame;
    if(!frame||snapshot.frame.time!==frame.time)return false;
    if(photographicSettings.some(key=>snapshot.frame.settings[key]!==frame.settings[key]))return false;
    if(exposureSettings.some(key=>snapshot.frame.exposure[key]!==frame.exposure[key]))return false;
  }
  return true;
}
