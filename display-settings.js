import {normalizeTint} from './phosphor-color.js';
export const ENVIRONMENTS=['none','diffuse','window','studio','observer','mixed'];
export const DISPLAY_DEFAULTS={brightness:2,persistence:.8,bloom:.5,scanlines:1.1,curvature:1.3,glass:1.6,ambient:.8,reflection:1.15,environment:'diffuse',reducedMotion:false,rasterFlicker:true,arrowsRight:false,monitorBorder:true,musicVolume:1,gameVolume:1,keyboardVolume:.5,monitorVolume:.5,tint:190};
export function normalizeSettings(saved={},reducedMotion=false){
 const result={...DISPLAY_DEFAULTS,reducedMotion};
 if(!saved||typeof saved!=='object')return result;
 for(const key of ['brightness','persistence','bloom','scanlines','curvature','glass','ambient','reflection'])if(Number.isFinite(saved[key]))result[key]=Math.max(key==='brightness'?.3:0,Math.min(2,saved[key]));
 for(const key of ['musicVolume','gameVolume','keyboardVolume','monitorVolume'])if(Number.isFinite(saved[key]))result[key]=Math.max(0,Math.min(1,saved[key]));
 result.tint=normalizeTint(Number.isFinite(saved.tint)?saved.tint:DISPLAY_DEFAULTS.tint);
 if(ENVIRONMENTS.includes(saved.environment))result.environment=saved.environment;
 if(typeof saved.reducedMotion==='boolean')result.reducedMotion=saved.reducedMotion;
 if(typeof saved.rasterFlicker==='boolean')result.rasterFlicker=saved.rasterFlicker;
 if(typeof saved.monitorBorder==='boolean')result.monitorBorder=saved.monitorBorder;
 if(typeof saved.arrowsRight==='boolean')result.arrowsRight=saved.arrowsRight;
 return result;
}
