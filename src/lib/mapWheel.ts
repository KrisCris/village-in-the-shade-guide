// Firefox scrolls a mouse wheel by lines; this many pixels each.
const LINE = 40;
// Mouse wheels in macOS Safari and Chrome scroll by multiples of this; trackpads never do.
const MAC_WHEEL_STEP = 4.000244140625;
// A wheel event this long after the previous one starts a new gesture.
const PAUSE = 250;

export interface WheelInput {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  timeStamp: number;
}
/** The device of the current burst of wheel events, carried between events. */
export interface WheelGesture {
  last: number;
  mouse: boolean;
}

const mouseStep = (dx: number, dy: number) =>
  dx === 0 && dy !== 0 && (Number.isInteger(Math.abs(dy) / MAC_WHEEL_STEP) || (Math.abs(dy) >= 50 && Number.isInteger(dy)));

/**
 * How far a wheel event pans the map, in screen pixels, and how much it zooms. A mouse wheel zooms.
 * On a trackpad two fingers pan and a pinch zooms; Chrome and Firefox send the pinch as a wheel event
 * with ctrlKey set, as they do ctrl + wheel. The first event of a burst decides the device, because a
 * trackpad keeps sending events while a flick glides to a stop.
 */
export function wheelMove(event: WheelInput, gesture: WheelGesture, page: number) {
  // Firefox reports lines only when deltaMode is read before the deltas.
  const unit = event.deltaMode === 1 ? LINE : event.deltaMode === 2 ? page : 1;
  const dx = event.deltaX * unit, dy = event.deltaY * unit;
  if (event.timeStamp - gesture.last > PAUSE) gesture.mouse = unit !== 1 || mouseStep(dx, dy);
  gesture.last = event.timeStamp;
  if (event.ctrlKey || event.metaKey) return { x: 0, y: 0, zoom: Math.exp(-dy * (gesture.mouse ? 0.0015 : 0.01)) };
  if (gesture.mouse) return { x: dx, y: 0, zoom: Math.exp(-dy * 0.0015) };
  return { x: dx, y: dy, zoom: 1 };
}
