/** Portable data only: importing these types never loads the D2 compiler. */
export type D2Mode = 'static' | 'steps' | 'tabs' | 'explorer' | 'animation' | 'flow';

/** Authored playback data, not a live request or measured trace. */
export interface D2FlowStep {
  edge: string;
  description: string;
  duration?: number;
  edgeToken: string;
  fromToken: string;
  toToken: string;
  from: string;
  to: string;
}

export interface D2Flow {
  scenarios: { id: string; label: string; steps: D2FlowStep[] }[];
}

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
  flow?: D2Flow;
  /** Opt-in playback when a flow diagram enters the viewport; see loop for replay. */
  autoplay?: boolean;
  /** Replay the selected flow scenario after a pause; manual Pause cancels replay. */
  loop?: boolean;
  loopDelay?: number;
}
