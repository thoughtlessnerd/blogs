import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// 1200x630 is the size every social platform crops against.
const WIDTH = 1200;
const HEIGHT = 630;

// Platforms do not all show the full 1200x630. WhatsApp (and several mobile
// clients) crop toward a square taken from the middle, which lops off anything
// hugging the left or right edge — a left-aligned "Hello, Proofs" showed up as
// "Proofs". A centred square crop is HEIGHT wide, so content kept within that
// width survives it; long titles wrap rather than run into the crop.
const SAFE_WIDTH = HEIGHT;

// Resolved from the project root rather than import.meta.url — this module is
// bundled before it runs, so a module-relative path lands in the build output.
const fontDir = path.join(process.cwd(), 'src', 'assets', 'fonts');
// Both families are vendored so the build never depends on a font CDN.
// The split mirrors the site: sans for furniture — the wordmark and the meta
// line — and serif for the writing, which on a card is the title.
const fonts = [
  { name: 'Inter', data: fs.readFileSync(path.join(fontDir, 'Inter-Regular.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: 'Inter', data: fs.readFileSync(path.join(fontDir, 'Inter-SemiBold.ttf')), weight: 600 as const, style: 'normal' as const },
  { name: 'Source Serif 4', data: fs.readFileSync(path.join(fontDir, 'SourceSerif4-Regular.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: 'Source Serif 4', data: fs.readFileSync(path.join(fontDir, 'SourceSerif4-SemiBold.ttf')), weight: 600 as const, style: 'normal' as const },
];

/**
 * Titles are set as large as they can be without overflowing. The thresholds
 * are character counts rather than measured width — close enough at these
 * sizes, and it avoids a text-measurement pass.
 */
function titleSize(title: string): number {
  if (title.length <= 28) return 88;
  if (title.length <= 55) return 70;
  return 54;
}

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
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#121110',
          // Stronger than the site's own glow: these cards are viewed against
          // black chat and feed backgrounds, where a near-black card has no
          // edges at all and reads as a loading failure.
          backgroundImage:
            'radial-gradient(1100px 620px at 50% -15%, #3a2b20 0%, #1d1813 45%, #121110 75%)',
          fontFamily: 'Inter',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                maxWidth: SAFE_WIDTH,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      fontSize: 30,
                      letterSpacing: 5,
                      color: '#e4916a',
                      fontWeight: 600,
                    },
                    children: 'THOUGHTLESSNERD',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      width: 72,
                      height: 4,
                      marginTop: 28,
                      marginBottom: 36,
                      backgroundColor: '#e4916a',
                      borderRadius: 2,
                    },
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      fontFamily: 'Source Serif 4',
                      fontSize: titleSize(title),
                      lineHeight: 1.2,
                      color: '#eae5db',
                      fontWeight: 600,
                    },
                    children: title,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      marginTop: 36,
                      fontSize: 28,
                      color: '#9b9387',
                    },
                    children: subtitle,
                  },
                },
              ],
            },
          },
          // Anchors the card against a dark feed and carries the accent colour
          // even when the preview is shrunk to an unreadable thumbnail.
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: WIDTH,
                height: 10,
                display: 'flex',
                backgroundImage: 'linear-gradient(90deg, #a23b1c 0%, #e4916a 100%)',
              },
            },
          },
        ],
      },
    },
    { width: WIDTH, height: HEIGHT, fonts }
  );

  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
}
