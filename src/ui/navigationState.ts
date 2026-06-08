export type TUIPanel =
  | 'chat'
  | 'dashboard'
  | 'commandPalette'
  | 'skillBrowser'
  | 'memoryReview'
  | 'reviewCockpit'
  | 'sessionViewer'
  | 'providerSetup'
  | 'approvalPanel'
  | 'errorPanel'
  | 'setupWizard';

export interface NavigationState {
  activePanel: TUIPanel;
  previousPanel?: TUIPanel;
  panelState: Record<string, unknown>;
}

export const defaultNavigationState: NavigationState = {
  activePanel: 'chat',
  panelState: {},
};

export const createNavigationReducer = () => {
  return {
    openPanel: (state: NavigationState, panel: TUIPanel, panelState?: Record<string, unknown>): NavigationState => ({
      ...state,
      previousPanel: state.activePanel,
      activePanel: panel,
      panelState: {
        ...state.panelState,
        [panel]: panelState ?? {},
      },
    }),

    closePanel: (state: NavigationState): NavigationState => ({
      activePanel: state.previousPanel ?? 'chat',
      previousPanel: undefined,
      panelState: state.panelState,
    }),

    back: (state: NavigationState): NavigationState => ({
      activePanel: state.previousPanel ?? 'chat',
      previousPanel: undefined,
      panelState: state.panelState,
    }),

    goToChat: (): NavigationState => defaultNavigationState,

    setPanelState: (state: NavigationState, panel: TUIPanel, panelState: Record<string, unknown>): NavigationState => ({
      activePanel: state.activePanel,
      previousPanel: state.previousPanel,
      panelState: {
        ...state.panelState,
        [panel]: {
          ...(state.panelState[panel] ?? {}),
          ...panelState,
        },
      },
    }),

    getPanelState: (state: NavigationState, panel: TUIPanel): Record<string, unknown> => {
      return (state.panelState[panel] as Record<string, unknown>) ?? {};
    },
  };
};

export const panelHelpText: Record<TUIPanel, string> = {
  chat: '? for help | /commands for palette | Ctrl+C to exit',
  dashboard: 'q to close | /start to quickstart | / to search',
  commandPalette: 'type to search | ↑↓ to navigate | Enter to run | Esc to close',
  skillBrowser: 'q to close | ↑↓ to select | Space to toggle',
  memoryReview: 'q to close | ↑↓ scroll | Space to approve/reject changes',
  reviewCockpit: 'q to close | Tab to switch panes | 1/2/3 for specific panes',
  sessionViewer: 'q to close | ↑↓ scroll | /export to download',
  providerSetup: 'q to close | /setup <provider> to configure',
  approvalPanel: 'y/n for decision | ? for details | Ctrl+C to cancel',
  errorPanel: 'q to close | /debug for details | /retry to try again',
  setupWizard: 'Navigate with arrow keys | Enter to select | Esc to cancel',
};

export const panelTitle: Record<TUIPanel, string> = {
  chat: 'ApeironCode',
  dashboard: 'Dashboard',
  commandPalette: 'Command Palette',
  skillBrowser: 'Skill Browser',
  memoryReview: 'Memory Review',
  reviewCockpit: 'Review Cockpit',
  sessionViewer: 'Session Viewer',
  providerSetup: 'Provider Setup',
  approvalPanel: 'Approval Required',
  errorPanel: 'Error',
  setupWizard: 'Initial Setup',
};

export const panelQuickKey: Partial<Record<TUIPanel, string>> = {
  chat: 'c',
  dashboard: 'd',
  commandPalette: 'k',
  skillBrowser: 's',
  memoryReview: 'm',
  reviewCockpit: 'r',
};
