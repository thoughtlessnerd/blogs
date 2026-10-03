import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { AUTHOR } from './config';

// 1200x630 is the size every social platform crops against.
const WIDTH = 1200;
const HEIGHT = 630;

// Resolved from the project root rather than import.meta.url — this module is
// bundled before it runs, so a module-relative path lands in the build output.
const fontDir = path.join(process.cwd(), 'src', 'assets', 'fonts');
const fonts = [
  { name: 'Inter', data: fs.readFileSync(path.join(fontDir, 'Inter-Regular.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: 'Inter', data: fs.readFileSync(path.join(fontDir, 'Inter-SemiBold.ttf')), weight: 600 as const, style: 'normal' as const },
];

/**
 * Renders a social preview card as a PNG. Runs at build time only — nothing
 * here ships to the browser, and no external service is involved.
 */
export async function renderOgImage({ title, subtitle }: { title: string; subtitle: string }) {
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0f1115',
          // Echoes the glow behind the site itself.
          backgroundImage: 'radial-gradient(900px 480px at 50% -10%, #1b2334 0%, #0f1115 70%)',
          padding: '72px',
          fontFamily: 'Inter',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', fontSize: 28, letterSpacing: 4, color: '#7aa2f7', fontWeight: 600 },
              children: 'THOUGHTLESSNERD',
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                fontSize: title.length > 60 ? 60 : 76,
                lineHeight: 1.15,
                color: '#e6e8eb',
                fontWeight: 600,
              },
              children: title,
            },
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#9aa3af' },
              children: [
                { type: 'div', props: { style: { display: 'flex' }, children: subtitle } },
                { type: 'div', props: { style: { display: 'flex' }, children: AUTHOR } },
              ],
            },
          },
        ],
      },
    },
    { width: WIDTH, height: HEIGHT, fonts }
  );

  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
}
