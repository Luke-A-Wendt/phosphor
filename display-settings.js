export const ENVIRONMENTS=['none','diffuse','window','studio','observer','mixed'];
export const DISPLAY_DEFAULTS={brightness:1.08,persistence:1,bloom:1.15,scanlines:1,curvature:1,glass:1.15,ambient:.35,reflection:.45,environment:'diffuse',reducedMotion:false};
export function normalizeSettings(saved={},reducedMotion=false){
 const result={...DISPLAY_DEFAULTS,reducedMotion};
 if(!saved||typeof saved!=='object')return result;
 for(const key of ['brightness','persistence','bloom','scanlines','curvature','glass','ambient','reflection'])if(Number.isFinite(saved[key]))result[key]=Math.max(key==='brightness'?.3:0,Math.min(2,saved[key]));
 if(ENVIRONMENTS.includes(saved.environment))result.environment=saved.environment;
 if(typeof saved.reducedMotion==='boolean')result.reducedMotion=saved.reducedMotion;
 return result;
}
