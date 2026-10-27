import { describe, expect, it } from 'vitest';
import { wheelMove, type WheelGesture, type WheelInput } from './mapWheel';

const event = (input: Partial<WheelInput>): WheelInput =>
  ({ deltaMode: 0, deltaX: 0, deltaY: 0, ctrlKey: false, metaKey: false, timeStamp: 0, ...input });
const fresh = (): WheelGesture => ({ last: -Infinity, mouse: false });

describe('wheelMove', () => {
  it('pans with two fingers on a trackpad', () => {
    expect(wheelMove(event({ deltaX: -3, deltaY: 12.5 }), fresh(), 700)).toEqual({ x: -3, y: 12.5, zoom: 1 });
    expect(wheelMove(event({ deltaY: 2 }), fresh(), 700)).toEqual({ x: 0, y: 2, zoom: 1 });
  });

  it('zooms on a trackpad pinch, which Chrome and Firefox send with ctrlKey', () => {
    const move = wheelMove(event({ deltaY: -10, ctrlKey: true }), fresh(), 700);
    expect(move.x).toBe(0);
    expect(move.y).toBe(0);
    expect(move.zoom).toBeCloseTo(Math.exp(0.1));
  });

  it('zooms with a mouse wheel in macOS Safari and Chrome, Windows browsers and Firefox', () => {
    for (const input of [{ deltaY: 4.000244140625 }, { deltaY: -12.000732421875 }, { deltaY: 100 }, { deltaY: -3, deltaMode: 1 }]) {
      const move = wheelMove(event(input), fresh(), 700);
      expect(move.y).toBe(0);
      expect(move.zoom).not.toBe(1);
    }
    expect(wheelMove(event({ deltaY: 100 }), fresh(), 700).zoom).toBeCloseTo(Math.exp(-.15));
    expect(wheelMove(event({ deltaY: 3, deltaMode: 1 }), fresh(), 700).zoom).toBeCloseTo(Math.exp(-.18));
  });

  it('keeps one device for a whole burst, so a trackpad flick never turns into zooming', () => {
    const gesture = fresh();
    wheelMove(event({ deltaY: 3, timeStamp: 1000 }), gesture, 700);
    expect(wheelMove(event({ deltaY: 100, timeStamp: 1016 }), gesture, 700)).toEqual({ x: 0, y: 100, zoom: 1 });
    expect(wheelMove(event({ deltaY: 100, timeStamp: 1500 }), gesture, 700).zoom).not.toBe(1);
  });

  it('pans sideways with shift + wheel and keeps ctrl + wheel at mouse speed', () => {
    expect(wheelMove(event({ deltaX: 4.000244140625 }), fresh(), 700)).toEqual({ x: 4.000244140625, y: 0, zoom: 1 });
    expect(wheelMove(event({ deltaX: 3, deltaMode: 1 }), fresh(), 700)).toEqual({ x: 120, y: 0, zoom: 1 });
    expect(wheelMove(event({ deltaY: 100, ctrlKey: true }), fresh(), 700).zoom).toBeCloseTo(Math.exp(-.15));
  });
});
