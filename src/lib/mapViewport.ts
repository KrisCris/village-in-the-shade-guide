export type MapView={x:number;y:number;width:number;height:number};
export const MAP_HOME:MapView={x:650,y:500,width:2750,height:3200};
export function zoomMap(view:MapView,factor:number,u=.5,v=.5):MapView{
  const width=Math.max(MAP_HOME.width/6,Math.min(MAP_HOME.width,view.width*factor));
  const height=width*MAP_HOME.height/MAP_HOME.width;
  return clampMap({x:view.x+(view.width-width)*u,y:view.y+(view.height-height)*v,width,height});
}
export function clampMap(view:MapView):MapView{
  return {...view,x:Math.max(MAP_HOME.x,Math.min(MAP_HOME.x+MAP_HOME.width-view.width,view.x)),y:Math.max(MAP_HOME.y,Math.min(MAP_HOME.y+MAP_HOME.height-view.height,view.y))};
}
