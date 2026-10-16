import { D2 } from '@terrastruct/d2';
import { pathToFileURL } from 'node:url';

const horizontalPadding = 24;
const verticalPadding = 16;

function leafBoxes(diagram) {
  return diagram.shapes.filter((shape) =>
    shape.label && ['rectangle', 'diamond'].includes(shape.type) &&
    !diagram.shapes.some((other) => other.id.startsWith(`${shape.id}.`)),
  );
}

function fittedSize(shape) {
  let width = Math.max(shape.width, shape.labelWidth + horizontalPadding);
  let height = Math.max(shape.height, shape.labelHeight + verticalPadding);
  if (shape.type === 'diamond') {
    // Fit the label's corners within the diamond, not just its bounding box.
    const factor = shape.labelWidth / (width - horizontalPadding) +
      shape.labelHeight / (height - verticalPadding);
    if (factor > 1) {
      width = horizontalPadding + (width - horizontalPadding) * factor;
      height = verticalPadding + (height - verticalPadding) * factor;
    }
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

export async function compileWithFittedLabels(d2, source, options = {}) {
  const compileOptions = { sketch: options.sketch ?? true, layout: options.layout ?? 'elk' };
  let compiled = await d2.compile(source, compileOptions);
  const overrides = [];
  for (const shape of leafBoxes(compiled.diagram)) {
    // D2 has already measured the actual embedded sketch font. Character-count
    // estimates are not reliable: even a 2px shortfall can move a label outside.
    const { width, height } = fittedSize(shape);
    if (width > shape.width || height > shape.height ||
        shape.labelPosition !== 'INSIDE_MIDDLE_CENTER') {
      overrides.push(
        `${shape.id}.width: ${width}`,
        `${shape.id}.height: ${height}`,
        `${shape.id}.label.near: center-center`,
      );
    }
  }
  if (overrides.length) {
    // Re-layout as well as resize so edges, neighboring boxes and viewBox agree.
    compiled = await d2.compile(`${source}\n${overrides.join('\n')}\n`, compileOptions);
  }

  const labelLayout = leafBoxes(compiled.diagram).map((shape) => {
    const size = fittedSize(shape);
    if (shape.labelPosition !== 'INSIDE_MIDDLE_CENTER' ||
        size.width > shape.width + 1 || size.height > shape.height + 1) {
      throw new Error(`D2 label does not fit inside node ${shape.id}: ${shape.label}`);
    }
    return {
      id: shape.id,
      type: shape.type,
      label: shape.label,
      width: shape.width,
      height: shape.height,
      labelWidth: shape.labelWidth,
      labelHeight: shape.labelHeight,
      labelPosition: shape.labelPosition,
    };
  });
  return { ...compiled, labelLayout };
}

export async function renderDiagram(d2, { source, salt, options = {} }) {
  const { diagram, renderOptions, labelLayout } = await compileWithFittedLabels(d2, source, options);
  // Blend into the documentation page instead of painting a white/dark canvas.
  diagram.root.fill = 'transparent';
  const renderSettings = {
    ...renderOptions,
    darkThemeID: undefined,
    noXMLTag: true,
    sketch: renderOptions.sketch ?? options.sketch ?? true,
    pad: options.padding ?? 12,
    scale: options.scale ?? 0.75,
  };
  const lightSvg = await d2.render(diagram, {
    ...renderSettings,
    themeID: options.lightTheme ?? 0,
    salt: `${salt}-light`,
  });
  const darkSvg = await d2.render(diagram, {
    ...renderSettings,
    themeID: options.darkTheme ?? 200,
    salt: `${salt}-dark`,
  });
  return { lightSvg, darkSvg, labelLayout };
}

// The SDK owns a long-lived WASM worker and has no public dispose API.
// Isolate it in a short-lived build subprocess, never in the Next.js runtime.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const result = await renderDiagram(new D2(), JSON.parse(input));
    process.stdout.write(JSON.stringify(result), () => process.exit(0));
  } catch (error) {
    process.stderr.write(String(error), () => process.exit(1));
  }
}
