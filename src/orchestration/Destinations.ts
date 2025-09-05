/**
 * Centralized destination validation utilities
 * Prevents drift between MessageValidator and MessageRouter
 */

export class DestinationUtil {
    private static readonly VALID_DESTINATIONS = [
        'conductor',
        'broadcast',
        'dashboard',
        'all-agents'
    ];

    /**
     * Validates if a destination string is valid
     * @param to - The destination string to validate
     * @returns true if valid, false otherwise
     */
    static isValidDestination(to: string): boolean {
        if (!to || typeof to !== 'string') {
            return false;
        }

        // Check for exact matches
        if (this.VALID_DESTINATIONS.includes(to)) {
            return true;
        }

        // Check for agent-specific destinations (agent-{id})
        if (to.startsWith('agent-') && to.length > 6) {
            return true;
        }

        return false;
    }

    /**
     * Gets all valid destination patterns
     * @returns Array of valid destination patterns
     */
    static getValidDestinations(): string[] {
        return [...this.VALID_DESTINATIONS];
    }

    /**
     * Checks if a destination is a broadcast destination
     * @param to - The destination string to check
     * @returns true if it's a broadcast destination
     */
    static isBroadcastDestination(to: string): boolean {
        return to === 'broadcast';
    }

    /**
     * Checks if a destination is an agent destination
     * @param to - The destination string to check
     * @returns true if it's an agent destination
     */
    static isAgentDestination(to: string): boolean {
        return to.startsWith('agent-') && to.length > 6;
    }

    /**
     * Checks if a destination is a conductor destination
     * @param to - The destination string to check
     * @returns true if it's a conductor destination
     */
    static isConductorDestination(to: string): boolean {
        return to === 'conductor';
    }

    /**
     * Checks if a destination is a dashboard destination
     * @param to - The destination string to check
     * @returns true if it's a dashboard destination
     */
    static isDashboardDestination(to: string): boolean {
        return to === 'dashboard';
    }

    /**
     * Extracts the agent ID from an agent destination
     * @param to - The agent destination string (e.g., "agent-123")
     * @returns The agent ID or null if not a valid agent destination
     */
    static extractAgentId(to: string): string | null {
        if (!this.isAgentDestination(to)) {
            return null;
        }
        return to.substring(6); // Remove "agent-" prefix
    }

    /**
     * Creates an agent destination string
     * @param agentId - The agent ID
     * @returns The agent destination string
     */
    static createAgentDestination(agentId: string): string {
        return `agent-${agentId}`;
    }
}
