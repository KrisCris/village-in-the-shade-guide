export type MapView={x:number;y:number;width:number;height:number};
/** Village minimap pixels that contain every marker, with a little margin. */
export const MAP_HOME:MapView={x:560,y:480,width:2860,height:3328};
export function zoomMap(view:MapView,factor:number,u=.5,v=.5):MapView{
  const width=Math.max(MAP_HOME.width/6,Math.min(MAP_HOME.width,view.width*factor));
  const height=width*MAP_HOME.height/MAP_HOME.width;
  return clampMap({x:view.x+(view.width-width)*u,y:view.y+(view.height-height)*v,width,height});
}
export function clampMap(view:MapView):MapView{
  return {...view,x:Math.max(MAP_HOME.x,Math.min(MAP_HOME.x+MAP_HOME.width-view.width,view.x)),y:Math.max(MAP_HOME.y,Math.min(MAP_HOME.y+MAP_HOME.height-view.height,view.y))};
}
/** Center a point, zooming in to at least `zoom`× without zooming back out. */
export function focusMap(view:MapView,x:number,y:number,zoom=3):MapView{
  const width=Math.max(MAP_HOME.width/6,Math.min(view.width,MAP_HOME.width/zoom));
  const height=width*MAP_HOME.height/MAP_HOME.width;
  return clampMap({x:x-width/2,y:y-height/2,width,height});
}
type Point={x:number;y:number};
/** Map point under an element-relative screen point, matching the SVG's default xMidYMid meet scaling. */
export function screenToMap(view:MapView,size:{width:number;height:number},p:Point):Point{
  const s=Math.min(size.width/view.width,size.height/view.height);
  return {x:view.x+(p.x-(size.width-view.width*s)/2)/s,y:view.y+(p.y-(size.height-view.height*s)/2)/s};
}
/**
 * Scale the view by `factor` (new width / old width) and move the map point that was
 * under `from` to `to`. One finger pans (factor 1); two fingers pass their midpoints.
 */
export function panZoomMap(view:MapView,size:{width:number;height:number},from:Point,to:Point,factor=1):MapView{
  const anchor=screenToMap(view,size,from);
  const width=Math.max(MAP_HOME.width/6,Math.min(MAP_HOME.width,view.width*factor));
  const height=width*MAP_HOME.height/MAP_HOME.width;
  const s=Math.min(size.width/width,size.height/height);
  return clampMap({x:anchor.x-(to.x-(size.width-width*s)/2)/s,y:anchor.y-(to.y-(size.height-height*s)/2)/s,width,height});
}
