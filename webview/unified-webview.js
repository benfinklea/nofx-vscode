// Unified NofX Webview JavaScript
const vscode = acquireVsCodeApi();

class NofXWebview {
    constructor() {
        this.state = vscode.getState() || {};
        this.initialize();
    }
    
    initialize() {
        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            this.handleMessage(message);
        });
        
        // Request initial data
        this.sendMessage({ type: 'ready' });
    }
    
    handleMessage(message) {
        switch (message.type) {
            case 'update':
                this.updateView(message.data);
                break;
            case 'error':
                this.showError(message.error);
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    }
    
    updateView(data) {
        // Update the view with new data
        this.state = { ...this.state, ...data };
        vscode.setState(this.state);
        this.render();
    }
    
    render() {
        // Render the current state
        const container = document.getElementById('content');
        if (!container) return;
        
        container.innerHTML = this.generateHTML();
        this.attachEventListeners();
    }
    
    generateHTML() {
        // Generate HTML based on current state
        return '<div class="card">NofX Ready</div>';
    }
    
    attachEventListeners() {
        // Attach event listeners to dynamic elements
    }
    
    sendMessage(message) {
        vscode.postMessage(message);
    }
    
    showError(error) {
        console.error('NofX Error:', error);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new NofXWebview();
});