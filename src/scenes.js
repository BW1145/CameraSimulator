// These viewpoints are source-rendered plates, not equivalent GLB conversions.
export const CLASSROOM_VIEWPOINTS = [
  {id:'classroom-desk',platePack:'scenes/classroom-desk-plates',name:'学生座位',title:'Classroom — Student Seat'},
  {id:'classroom-window',platePack:'scenes/classroom-window-plates',name:'窗边逆光',title:'Classroom — Window Backlight'},
  {id:'classroom-teacher',platePack:'scenes/classroom-teacher-plates',name:'讲台视角',title:'Classroom — Teacher View'},
].map(scene=>({...scene,plateOnly:true,author:'Christophe Seux',license:'CC0',baseEV:8,ballDistance:3,fill:1}));

export const KITCHEN_VIEWPOINTS = [
  {id:'kitchen-pastry',platePack:'scenes/kitchen-pastry-plates',name:'糕点台面',title:'Kitchen — Pastry Counter'},
  {id:'kitchen-tea',platePack:'scenes/kitchen-tea-plates',name:'厨房茶桌',title:'Kitchen — Tea Table'},
].map(scene=>({...scene,plateOnly:true,author:'Nicole Morena',license:'CC BY-SA',baseEV:8,ballDistance:3,fill:1}));
export const APARTMENT_VIEWPOINTS = [
  {id:'apartment-armchair',platePack:'scenes/apartment-armchair-plates',name:'公寓单椅',title:'Apartment — Armchair'},
].map(scene=>({...scene,plateOnly:true,author:'Flavio Della Tommasa',license:'CC BY',baseEV:8,ballDistance:3,fill:1}));
export const MONK_VIEWPOINTS = [
  {id:'monk-colonnade',platePack:'scenes/monk-colonnade-plates',name:'修道院回廊',title:'Monastery — Colonnade'},
  {id:'monk-reading-table',platePack:'scenes/monk-reading-table-plates',name:'修道院阅读桌',title:'Monastery — Reading Table'},
  {id:'monk-courtyard',platePack:'scenes/monk-courtyard-plates',name:'修道院庭院',title:'Monastery — Courtyard Pavilion'},
].map(scene=>({...scene,plateOnly:true,author:'Carlo Bergonzini / Monorender',license:'CC BY',baseEV:8,ballDistance:3,fill:1}));
export const DERIVED_VIEWPOINTS = [...CLASSROOM_VIEWPOINTS,...KITCHEN_VIEWPOINTS,...APARTMENT_VIEWPOINTS,...MONK_VIEWPOINTS];

export const SCENES = [
  {id:'barbershop',platePack:'scenes/barbershop-plates',name:'理发店',title:'Agent 327 Barbershop',camera:'Camera',author:'Blender Foundation / Blender Studio',license:'CC BY',baseEV:8,ballDistance:3,focus:3,focal:20,startForward:1.25,fill:1,bakedLighting:{exposureOffset:6,fill:.06,sunlight:.03,lightScale:1/683}},
  {id:'classroom',platePack:'scenes/classroom-plates',name:'教室全景',title:'Classroom',camera:'renderCam',author:'Christophe Seux',license:'CC0',baseEV:8,ballDistance:3,focus:4,focal:28,startUp:.35,fill:1},
  ...CLASSROOM_VIEWPOINTS,
  {id:'kitchen',platePack:'scenes/kitchen-plates',name:'厨房',title:'Cozy Kitchen',camera:'CAM-wide',author:'Nicole Morena',license:'CC BY-SA',baseEV:8,ballDistance:3,focus:12.5,focal:35,startForward:6,fill:1},
  ...KITCHEN_VIEWPOINTS,
  {id:'apartment',platePack:'scenes/apartment-plates',name:'公寓',title:'Italian Flat',camera:'Cam Living',author:'Flavio Della Tommasa',license:'CC BY',baseEV:8,ballDistance:10,focus:6,focal:28,startForward:4.1,startUp:.4,fill:1},
  ...APARTMENT_VIEWPOINTS,
  ...MONK_VIEWPOINTS,
];

// The optional full-geometry diagnostic keeps the four real GLB conversions.
// Derived views use independently reviewed photographic cameras, not invented
// camera entries in the retained original GLBs.
export function scenesForRenderer(usePlates=true){return SCENES.filter(scene=>usePlates||!scene.plateOnly);}

export function sceneDefaults(scene,pack){
  if(!pack)return {focus:scene.focus,focal:scene.focal,baseEV:scene.baseEV};
  const focus=pack.defaults?.focus??scene.focus;
  const baseEV=pack.defaults?.baseEV??scene.baseEV;
  if(!Number.isFinite(focus)||focus<.2||focus>50||!Number.isFinite(baseEV))throw Error('场景缺少有效的默认对焦／曝光标定。');
  if(!Number.isFinite(pack.referenceFocal)||pack.referenceFocal<=0)throw Error('场景缺少有效的原始焦距。');
  return {focus,baseEV,focal:Math.max(pack.referenceFocal,pack.minimumFocal??0)};
}
