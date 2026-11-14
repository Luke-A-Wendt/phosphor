import {DEFAULT_TINT,normalizeTint} from './phosphor-color.js';
export const ENVIRONMENTS=['none','diffuse','window','studio','observer','mixed'];
export const DISPLAY_DEFAULTS={brightness:1.75,persistence:1,bloom:1.4,scanlines:1.6,curvature:.75,glass:1.25,ambient:1.5,reflection:1.45,environment:'diffuse',reducedMotion:false,arrowsRight:false,musicVolume:1,gameVolume:1,keyboardVolume:.5,monitorVolume:.5,tint:DEFAULT_TINT};
export function normalizeSettings(saved={},reducedMotion=false){
 const result={...DISPLAY_DEFAULTS,reducedMotion};
 if(!saved||typeof saved!=='object')return result;
 for(const key of ['brightness','persistence','bloom','scanlines','curvature','glass','ambient','reflection'])if(Number.isFinite(saved[key]))result[key]=Math.max(key==='brightness'?.3:0,Math.min(2,saved[key]));
 for(const key of ['musicVolume','gameVolume','keyboardVolume','monitorVolume'])if(Number.isFinite(saved[key]))result[key]=Math.max(0,Math.min(1,saved[key]));
 result.tint=normalizeTint(saved.tint);
 if(ENVIRONMENTS.includes(saved.environment))result.environment=saved.environment;
 if(typeof saved.reducedMotion==='boolean')result.reducedMotion=saved.reducedMotion;
 if(typeof saved.arrowsRight==='boolean')result.arrowsRight=saved.arrowsRight;
 return result;
}
