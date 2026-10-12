import { useEffect, useState } from 'react';

/** Visible pixel box [x, y, width, height, naturalWidth, naturalHeight]; scene sprites keep transparent anchor padding. */
type Box = [number, number, number, number, number, number];
const boxes = new Map<string, Promise<Box | null>>();

function visibleBox(src: string) {
  let job = boxes.get(src);
  if (!job) {
    job = new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) return resolve(null);
          context.drawImage(image, 0, 0);
          const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
          let left = width, top = height, right = -1, bottom = -1;
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] < 16) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
          resolve(right < 0 ? null : [left, top, right - left + 1, bottom - top + 1, width, height]);
        } catch {
          resolve(null);
        }
      };
      image.onerror = () => resolve(null);
      image.src = src;
    });
    boxes.set(src, job);
  }
  return job;
}

/** Shows only the visible part of a sprite, centred and scaled to fit its box. */
export default function TrimmedSprite({ src, className, label }: { src: string; className?: string; label?: string }) {
  const [box, setBox] = useState<Box | null | undefined>();
  useEffect(() => {
    let live = true;
    setBox(undefined);
    visibleBox(src).then(value => { if (live) setBox(value); });
    return () => { live = false; };
  }, [src]);
  if (box === undefined) return <span className={className} aria-hidden="true" />;
  if (box === null) return <img className={className} src={src} alt={label ?? ''} draggable={false} />;
  return <svg className={className} viewBox={box.slice(0, 4).join(' ')} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <image href={src} width={box[4]} height={box[5]} />
  </svg>;
}
