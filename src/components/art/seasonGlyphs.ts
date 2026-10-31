import type {SEASONS} from '../../domain/scenery';
// Season marks for the theme picker and the season-plan nav, drawn on a -24…24 viewBox.
// Shapes and colours follow the falling particles in FallingLeaves.astro.
export type GlyphShape={d:string;fill?:string;stroke?:string;strokeWidth?:number;transform?:string};
const PETAL='M0 17C-17 6-17-13-5-15Q-1-14 0-8Q4-16 9-13C20-4 10 11 0 17';
export const SEASON_GLYPHS:Record<typeof SEASONS[number],GlyphShape[]>={
  // Five particle petals, notches outward, so the mark reads as a sakura blossom rather than a heart.
  spring:[
    ...Array.from({length:5},(_,i)=>({d:PETAL,fill:'#efb1c8',stroke:'#d987a6',strokeWidth:1.6,transform:`rotate(${i*72}) translate(0 -10.2) scale(.6)`})),
    {d:'M-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',fill:'#d987a6'},
  ],
  // Tilted so the flat leaf fills the square like the other marks.
  summer:[{d:'M-17 0C-8-15 10-12 17 0C4 11-7 12-17 0',fill:'#70974e',transform:'rotate(-40) scale(1.15)'},{d:'M-17 0H15',stroke:'#dde5a9',transform:'rotate(-40) scale(1.15)'}],
  autumn:[{d:'M0-20 5-9 9-13 9-3 18-7 15 1 20 3 7 10 3 10 1 18-1 18-2 10-9 11-19 3-14 1-18-7-8-3-9-13-4-9Z',fill:'#c74f3f'}],
  winter:Array.from({length:6},(_,i)=>({d:'M0 0V-17M0-10-4-14M0-10 4-14',stroke:'#8faebb',strokeWidth:2,transform:`rotate(${i*60})`})),
};
