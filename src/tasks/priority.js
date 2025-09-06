"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priorityToNumeric = priorityToNumeric;
exports.numericToPriority = numericToPriority;
function priorityToNumeric(priority) {
    switch (priority) {
        case 'high': return 100;
        case 'medium': return 50;
        case 'low': return 10;
        default: return 25;
    }
}
function numericToPriority(numeric) {
    if (numeric >= 100)
        return 'high';
    if (numeric >= 50)
        return 'medium';
    if (numeric >= 10)
        return 'low';
    return 'low';
}
//# sourceMappingURL=priority.js.map