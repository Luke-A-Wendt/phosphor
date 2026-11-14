// Geometry uses the visible viewport in CSS pixels. Browser/host chrome is not
// part of these dimensions; safe-area insets are applied once, inside it.
const finiteSize=value=>Number.isFinite(value)?Math.max(0,value):0;
const rect=(x=0,y=0,width=0,height=0)=>({x,y,width,height});
function insets(first,last,size){
 first=Math.min(finiteSize(first),size);last=Math.min(finiteSize(last),size);
 const total=first+last,scale=total>size?size/total:1;
 return [first*scale,last*scale];
}

export function solveViewportLayout(options={}){
 const {width,height,leftInset=0,rightInset=0,topInset=0,bottomInset=0,touch=false,arrowsRight=false}=options??{};
 const w=finiteSize(width),h=finiteSize(height);
 const [left,right]=insets(leftInset,rightInset,w),[top,bottom]=insets(topInset,bottomInset,h);
 const availableWidth=Math.max(0,w-left-right),availableHeight=Math.max(0,h-top-bottom);
 const result={viewport:{width:w,height:h},screen:rect(),keySize:0,keyGap:0,screenGap:0,escape:rect(),arrows:rect(),enter:rect()};
 if(!touch){
  const screenWidth=Math.min(availableWidth,availableHeight*4/3),screenHeight=screenWidth*3/4;
  result.screen=rect(left+(availableWidth-screenWidth)/2,top+(availableHeight-screenHeight)/2,screenWidth,screenHeight);
  return result;
 }

 // Reserve a small physical margin for key travel and shadows. Keep the
 // monitor-to-key clearance fixed; unused width belongs outside the controls.
 const pad=Math.min(6,availableWidth/16,availableHeight/16);
 const keyGap=Math.min(5,availableWidth/40,availableHeight/40);
 const screenGap=Math.min(8,availableWidth/30,availableHeight/30);
 const fullScreenWidth=availableHeight*4/3;
 const verticalLimit=Math.max(0,(availableHeight-2*pad-keyGap-screenGap)/3);
 const widthAtFullHeight=(availableWidth-fullScreenWidth-2*pad-2*keyGap-2*screenGap)/4;

 // Prefer a full-height CRT. If it cannot coexist with 44px touch targets,
 // preserve those targets and contain the CRT in the remaining space instead.
 // Extremely small viewports scale below 44px rather than overlap or overflow.
 const emergencyScreenWidth=Math.min(32,availableWidth*.2);
 const horizontalLimit=Math.max(0,(availableWidth-2*pad-2*keyGap-2*screenGap-emergencyScreenWidth)/4);
 const keySize=Math.max(0,Math.min(verticalLimit,horizontalLimit,Math.max(44,widthAtFullHeight)));
 const arrowWidth=3*keySize+2*keyGap,arrowHeight=2*keySize+keyGap;
 const screenWidth=Math.max(0,Math.min(fullScreenWidth,availableWidth-2*pad-arrowWidth-keySize-2*screenGap));
 const screenHeight=screenWidth*3/4;
 const compositionWidth=arrowWidth+screenGap+screenWidth+screenGap+keySize;
 const start=left+(availableWidth-compositionWidth)/2;
 const controlsBottom=top+availableHeight-pad;
 result.screen=rect(start+arrowWidth+screenGap,top+(availableHeight-screenHeight)/2,screenWidth,screenHeight);
 result.escape=rect(start,top+pad,keySize,keySize);
 result.arrows=rect(start,controlsBottom-arrowHeight,arrowWidth,arrowHeight);
 result.enter=rect(result.screen.x+screenWidth+screenGap,controlsBottom-arrowHeight,keySize,arrowHeight);
 // Swap only horizontal placement: retain key geometry, artwork orientation,
 // clearances and the original Escape position in either thumb layout.
 if(arrowsRight){
  result.enter.x=start;
  result.screen.x=start+keySize+screenGap;
  result.arrows.x=result.screen.x+screenWidth+screenGap;
 }
 result.keySize=keySize;result.keyGap=keyGap;result.screenGap=screenGap;
 return result;
}
