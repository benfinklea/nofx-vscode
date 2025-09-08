/**
 * Centralized priority conversion utilities
 */

/**
 * Converts string priority to numeric priority
 */
export function priorityToNumeric(priority: string): number {
    switch (priority) {
        case 'high':
            return 100;
        case 'medium':
            return 50;
        case 'low':
            return 10;
        default:
            return 25;
    }
}

/**
 * Converts numeric priority to string priority
 */
export function numericToPriority(numeric: number): string {
    if (numeric >= 100) return 'high';
    if (numeric >= 50) return 'medium';
    if (numeric >= 10) return 'low';
    return 'low';
}
