/**
 * Output channel names used throughout the NofX extension.
 * These constants ensure consistency across all components.
 */

export const OUTPUT_CHANNELS = {
    /** Main extension output channel for general messages */
    MAIN: 'NofX',

    /** Orchestration server and WebSocket communication logs */
    ORCHESTRATION: 'NofX - Orchestration',

    /** Conductor brain decision-making and reasoning logs */
    CONDUCTOR_BRAIN: 'NofX Conductor Brain',

    /** VP-level conductor strategic planning logs */
    VP_BRAIN: 'NofX VP Brain 🧠',

    /** Codebase analysis and intelligence gathering logs */
    ANALYZER: 'NofX Analyzer',

    /** Command verification and validation logs */
    COMMAND_VERIFICATION: 'NofX Command Verification',

    /** Test execution logs (used in test suites) */
    TEST: 'NofX Test'
} as const;

/** Type for output channel names */
export type OutputChannelName = (typeof OUTPUT_CHANNELS)[keyof typeof OUTPUT_CHANNELS];

/**
 * Output channel descriptions for documentation
 */
export const OUTPUT_CHANNEL_DESCRIPTIONS: Record<OutputChannelName, string> = {
    [OUTPUT_CHANNELS.MAIN]: 'General extension messages and status updates',
    [OUTPUT_CHANNELS.ORCHESTRATION]: 'WebSocket server and message routing logs',
    [OUTPUT_CHANNELS.CONDUCTOR_BRAIN]: 'Intelligent conductor decision-making and reasoning',
    [OUTPUT_CHANNELS.VP_BRAIN]: 'Strategic VP-level planning and architecture decisions',
    [OUTPUT_CHANNELS.ANALYZER]: 'Codebase analysis and intelligence gathering',
    [OUTPUT_CHANNELS.COMMAND_VERIFICATION]: 'Command registration validation and verification',
    [OUTPUT_CHANNELS.TEST]: 'Test execution and debugging information'
};

/**
 * When channels are created relative to extension lifecycle
 */
export const CHANNEL_CREATION_TIMING: Record<OutputChannelName, string> = {
    [OUTPUT_CHANNELS.MAIN]: 'Extension activation',
    [OUTPUT_CHANNELS.ORCHESTRATION]: 'First WebSocket connection or server start',
    [OUTPUT_CHANNELS.CONDUCTOR_BRAIN]: 'Intelligent Conductor initialization',
    [OUTPUT_CHANNELS.VP_BRAIN]: 'VP Conductor initialization',
    [OUTPUT_CHANNELS.ANALYZER]: 'First code analysis request',
    [OUTPUT_CHANNELS.COMMAND_VERIFICATION]: 'Debug command execution',
    [OUTPUT_CHANNELS.TEST]: 'Test suite initialization'
};
