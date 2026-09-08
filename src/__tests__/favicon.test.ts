import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const faviconAssets = [
  ['projecthub-favicon-d875867b-16.png', 16],
  ['projecthub-favicon-d875867b-32.png', 32],
  ['projecthub-favicon-d875867b-48.png', 48],
  ['projecthub-apple-touch-icon-d875867b.png', 180],
] as const;

function readPngDimensions(fileName: string) {
  const png = readFileSync(resolve(process.cwd(), 'public', fileName));

  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');

  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png.readUInt8(25),
  };
}

describe('favicon do ProjectHub', () => {
  it('declara os ícones versionados usando o base path do Vite', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(html).toContain('<title>ProjectHub | Gestão Integrada de Projetos</title>');

    for (const [fileName] of faviconAssets) {
      expect(html).toContain(`href="%BASE_URL%${fileName}"`);
    }

    expect(html).not.toMatch(/rel=["'](?:shortcut )?icon["'][^>]+vite\.svg/i);
  });

  it.each(faviconAssets)('gera %s em %d x %d com transparência', (fileName, size) => {
    const dimensions = readPngDimensions(fileName);

    expect(dimensions).toEqual({ width: size, height: size, colorType: 6 });
  });
});
