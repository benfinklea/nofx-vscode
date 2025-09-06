"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DestinationUtil = void 0;
class DestinationUtil {
    static isValidDestination(to) {
        if (!to || typeof to !== 'string') {
            return false;
        }
        if (this.VALID_DESTINATIONS.includes(to)) {
            return true;
        }
        if (to.startsWith('agent-') && to.length > 6) {
            return true;
        }
        return false;
    }
    static getValidDestinations() {
        return [...this.VALID_DESTINATIONS];
    }
    static isBroadcastDestination(to) {
        return to === 'broadcast';
    }
    static isAgentDestination(to) {
        return to.startsWith('agent-') && to.length > 6;
    }
    static isConductorDestination(to) {
        return to === 'conductor';
    }
    static isDashboardDestination(to) {
        return to === 'dashboard';
    }
    static extractAgentId(to) {
        if (!this.isAgentDestination(to)) {
            return null;
        }
        return to.substring(6);
    }
    static createAgentDestination(agentId) {
        return `agent-${agentId}`;
    }
}
exports.DestinationUtil = DestinationUtil;
DestinationUtil.VALID_DESTINATIONS = [
    'conductor',
    'broadcast',
    'dashboard',
    'all-agents'
];
//# sourceMappingURL=Destinations.js.map