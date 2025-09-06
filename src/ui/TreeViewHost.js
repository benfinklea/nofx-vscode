"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TreeViewHost = void 0;
class TreeViewHost {
    constructor(treeView, dataProvider, loggingService) {
        this.subscriptions = [];
        this.treeView = treeView;
        this.dataProvider = dataProvider;
        this.loggingService = loggingService;
        this.loggingService?.debug('TreeViewHost: Created for tree view', {
            title: treeView.title
        });
    }
    static create(treeView, dataProvider, loggingService) {
        return new TreeViewHost(treeView, dataProvider, loggingService);
    }
    refresh() {
        try {
            if (this.dataProvider && typeof this.dataProvider.refresh === 'function') {
                this.dataProvider.refresh();
                this.loggingService?.debug('TreeViewHost: Refreshed via data provider');
            }
            else {
                this.loggingService?.warn('TreeViewHost: No data provider with refresh method available');
            }
        }
        catch (error) {
            this.loggingService?.error('TreeViewHost: Error refreshing tree view', error);
            throw error;
        }
    }
    reveal(element) {
        try {
            this.treeView.reveal(element);
            this.loggingService?.debug('TreeViewHost: Revealed element', {
                elementId: element?.id || 'unknown'
            });
        }
        catch (error) {
            this.loggingService?.error('TreeViewHost: Error revealing element', error);
            throw error;
        }
    }
    onDidChangeSelection(handler) {
        const disposable = this.treeView.onDidChangeSelection((e) => {
            try {
                this.loggingService?.debug('TreeViewHost: Selection changed', {
                    selectionCount: e.selection.length
                });
                handler(e.selection);
            }
            catch (error) {
                this.loggingService?.error('TreeViewHost: Error handling selection change', error);
            }
        });
        this.subscriptions.push(disposable);
        return disposable;
    }
    getSelection() {
        try {
            return [...this.treeView.selection];
        }
        catch (error) {
            this.loggingService?.error('TreeViewHost: Error getting selection', error);
            return [];
        }
    }
    setSelection(items) {
        try {
            this.loggingService?.debug('TreeViewHost: Set selection requested', {
                itemCount: items.length
            });
        }
        catch (error) {
            this.loggingService?.error('TreeViewHost: Error setting selection', error);
            throw error;
        }
    }
    get visible() {
        return this.treeView.visible;
    }
    get title() {
        return this.treeView.title || '';
    }
    set title(value) {
        this.treeView.title = value;
        this.loggingService?.debug('TreeViewHost: Set title', { title: value });
    }
    get message() {
        return this.treeView.message || '';
    }
    set message(value) {
        this.treeView.message = value;
        this.loggingService?.debug('TreeViewHost: Set message', { message: value });
    }
    get description() {
        return this.treeView.description || '';
    }
    set description(value) {
        this.treeView.description = value;
        this.loggingService?.debug('TreeViewHost: Set description', { description: value });
    }
    onDidChangeVisibility(listener) {
        const disposable = this.treeView.onDidChangeVisibility(listener);
        this.subscriptions.push(disposable);
        return disposable;
    }
    onDidExpandElement(listener) {
        const disposable = this.treeView.onDidExpandElement(listener);
        this.subscriptions.push(disposable);
        return disposable;
    }
    onDidCollapseElement(listener) {
        const disposable = this.treeView.onDidCollapseElement(listener);
        this.subscriptions.push(disposable);
        return disposable;
    }
    dispose() {
        this.loggingService?.debug('TreeViewHost: Disposing');
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
    }
}
exports.TreeViewHost = TreeViewHost;
//# sourceMappingURL=TreeViewHost.js.map