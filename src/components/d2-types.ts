/** Portable data only: importing these types never loads the D2 compiler. */
export type D2Mode = 'static' | 'steps' | 'tabs' | 'explorer' | 'animation';

export interface D2Board {
  /** D2 target path. The root board is the empty string. */
  id: string;
  label: string;
  kind: 'root' | 'layer' | 'scenario' | 'step';
  parent?: string;
  description?: string;
  lightSvg: string;
  darkSvg: string;
}

export interface D2DiagramProps {
  id: string;
  caption: string;
  lightSvg: string;
  darkSvg: string;
  className?: string;
}

export interface D2InteractiveDiagramProps extends D2DiagramProps {
  source?: string;
  boards?: D2Board[];
  mode?: D2Mode;
  interval?: number;
  animation?: { lightSvg: string; darkSvg: string };
}
