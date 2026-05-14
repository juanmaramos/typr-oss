export const SURFACE_TRANSITION_TIMING = "duration-200 ease-out";

export const CONTEXT_PANE_TRANSITION = `transition-[width,opacity] ${SURFACE_TRANSITION_TIMING}`;

export const RESIZABLE_PANEL_TRANSITION = `transition-[flex-basis,opacity,border-color] ${SURFACE_TRANSITION_TIMING}`;

export const PANEL_HANDLE_TRANSITION = `transition-[opacity,background-color] ${SURFACE_TRANSITION_TIMING}`;

export const FLOATING_DOCK_SURFACE_TRANSITION =
  `transition-[max-width,min-height,transform,box-shadow,border-color,background-color] ${SURFACE_TRANSITION_TIMING}`;
