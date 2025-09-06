"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanelBinder = void 0;
class PanelBinder {
    constructor(loggingService) {
        this.loggingService = loggingService;
        this.subscriptions = [];
        this.disposed = false;
    }
    static create(loggingService) {
        return new PanelBinder(loggingService);
    }
    bindWebviewToViewModel(webviewHost, viewModel, htmlGenerator, options = {}) {
        if (this.disposed) {
            this.loggingService.warn('PanelBinder: Attempted to bind after disposal');
            return;
        }
        const getInitialState = async () => {
            try {
                if (viewModel.getViewState) {
                    return viewModel.getViewState();
                }
                else if (viewModel.getDashboardState) {
                    return await viewModel.getDashboardState();
                }
                return {};
            }
            catch (error) {
                this.loggingService.error('PanelBinder: Error getting initial state', error);
                return {};
            }
        };
        getInitialState().then(initialState => {
            webviewHost.setHtml(htmlGenerator(initialState, webviewHost));
        });
        if (viewModel.subscribe) {
            this.subscriptions.push(viewModel.subscribe((state) => {
                webviewHost.postMessage({ command: 'setState', state });
            }));
        }
        this.subscriptions.push(webviewHost.onDidReceiveMessage((message) => {
            if (viewModel.handleCommand) {
                viewModel.handleCommand(message.command, message.data);
            }
        }));
        this.subscriptions.push(webviewHost.onDidDispose(() => {
            if (options.onDispose) {
                options.onDispose();
            }
            this.dispose();
        }));
    }
    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.loggingService.debug('PanelBinder: Disposing');
        this.subscriptions.forEach(subscription => {
            try {
                subscription.dispose();
            }
            catch (error) {
                this.loggingService.error('PanelBinder: Error disposing subscription', error);
            }
        });
        this.subscriptions = [];
    }
}
exports.PanelBinder = PanelBinder;
//# sourceMappingURL=panelBinder.js.map